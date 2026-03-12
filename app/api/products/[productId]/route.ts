import { NextResponse } from "next/server";

import { buildRequestContext } from "@/lib/http/request-context";
import { getStoreProductByIdDirectFromPostgres } from "@/lib/platform/postgres-products-onboarding";
import {
  removeProductImageInPostgres,
  setProductActiveInPostgres,
  updateProductCostInPostgres,
  updateProductImageInPostgres,
  updateProductInPostgres,
} from "@/lib/platform/postgres-products-write";
import {
  RBACError,
  enforcePermission,
  hasPermission,
  toRBACErrorResponse,
} from "@/lib/rbac/access";
import { normalizeProductPayload, updateProductSchema } from "@/lib/products/validation";
import {
  deleteProductImageFromR2,
  isProductImageR2Configured,
  resolveProductImageUrl,
  uploadProductImageToR2,
} from "@/lib/storage/r2";

function toProductWriteErrorResponse(error: string) {
  if (error === "NOT_FOUND") {
    return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
  }

  if (error === "CONFLICT_SKU") {
    return NextResponse.json({ message: "SKU นี้มีอยู่แล้วในร้าน" }, { status: 409 });
  }

  if (error === "INVALID_UNIT") {
    return NextResponse.json({ message: "พบหน่วยสินค้าที่ไม่ถูกต้อง" }, { status: 400 });
  }

  if (error === "INVALID_CATEGORY") {
    return NextResponse.json({ message: "พบหมวดหมู่สินค้าที่ไม่ถูกต้อง" }, { status: 400 });
  }

  if (error === "VARIANT_CONFLICT") {
    return NextResponse.json(
      {
        message:
          "Variant นี้ซ้ำกับสินค้าใน Model เดียวกัน กรุณาเปลี่ยนตัวเลือก/ชื่อ Variant",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ message: "บันทึกสินค้าไม่สำเร็จ" }, { status: 400 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const { productId } = await context.params;

    if (contentType.includes("multipart/form-data")) {
      const { storeId } = await enforcePermission("products.update");

      if (!isProductImageR2Configured()) {
        return NextResponse.json(
          { message: "ยังไม่ได้ตั้งค่า R2 สำหรับรูปสินค้า" },
          { status: 500 },
        );
      }

      const targetProduct = await getStoreProductByIdDirectFromPostgres(storeId, productId);
      if (!targetProduct) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      const formData = await request.formData();
      const file = formData.get("image");
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json({ message: "กรุณาเลือกไฟล์รูปภาพ" }, { status: 400 });
      }

      let imageKey: string;
      try {
        const upload = await uploadProductImageToR2({
          storeId,
          productName: targetProduct.name,
          file,
        });
        imageKey = upload.objectKey;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "UNSUPPORTED_FILE_TYPE") {
            return NextResponse.json({ message: "รองรับเฉพาะไฟล์รูปภาพ" }, { status: 400 });
          }
          if (error.message === "UNSUPPORTED_RASTER_FORMAT") {
            return NextResponse.json(
              { message: "รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP สำหรับรูปสินค้า" },
              { status: 400 },
            );
          }
          if (error.message === "FILE_TOO_LARGE") {
            return NextResponse.json(
              { message: "ไฟล์รูปสินค้าใหญ่เกินกำหนด (ไม่เกิน 3MB)" },
              { status: 400 },
            );
          }
          if (error.message === "IMAGE_OPTIMIZATION_FAILED") {
            return NextResponse.json(
              {
                message: "ไม่สามารถปรับขนาดรูปสินค้าได้ กรุณาเลือกไฟล์ JPG, PNG หรือ WebP ที่เล็กลง",
              },
              { status: 400 },
            );
          }
        }

        return NextResponse.json({ message: "อัปโหลดรูปสินค้าไม่สำเร็จ" }, { status: 500 });
      }

      if (targetProduct.imageUrl) {
        try {
          await deleteProductImageFromR2({ imageUrl: targetProduct.imageUrl });
        } catch {
          // non-critical
        }
      }

      const result = await updateProductImageInPostgres({
        storeId,
        productId,
        imageUrl: imageKey,
      });

      if (!result.ok) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, imageUrl: resolveProductImageUrl(imageKey) });
    }

    const parsed = updateProductSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    if (parsed.data.action === "set_active") {
      const { storeId, session } = await enforcePermission("products.view");
      const [canArchive, canDelete] = await Promise.all([
        hasPermission({ userId: session.userId }, storeId, "products.archive"),
        hasPermission({ userId: session.userId }, storeId, "products.delete"),
      ]);

      if (!canArchive && !canDelete) {
        throw new RBACError(403, "ไม่มีสิทธิ์ปิดใช้งานสินค้า");
      }

      const result = await setProductActiveInPostgres({
        storeId,
        productId,
        active: parsed.data.active,
      });

      if (!result.ok) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "update_cost") {
      const { storeId, session } = await enforcePermission("products.view");
      const canUpdateCost = await hasPermission(
        { userId: session.userId },
        storeId,
        "products.cost.update",
      );
      if (!canUpdateCost) {
        throw new RBACError(403, "ไม่มีสิทธิ์แก้ไขต้นทุนสินค้า");
      }

      const result = await updateProductCostInPostgres({
        storeId,
        productId,
        nextCostBase: parsed.data.costBase,
        reason: parsed.data.reason,
        actorUserId: session.userId,
        actorName: session.displayName,
        actorRole: session.activeRoleName,
        requestContext: buildRequestContext(request),
      });

      if (!result.ok) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      if (result.unchanged) {
        return NextResponse.json({ ok: true, unchanged: true });
      }

      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "remove_image") {
      const { storeId } = await enforcePermission("products.update");
      const targetProduct = await getStoreProductByIdDirectFromPostgres(storeId, productId);
      if (!targetProduct) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      if (targetProduct.imageUrl) {
        try {
          await deleteProductImageFromR2({ imageUrl: targetProduct.imageUrl });
        } catch {
          // non-critical
        }
      }

      const result = await removeProductImageInPostgres({
        storeId,
        productId,
      });

      if (!result.ok) {
        return NextResponse.json({ message: "ไม่พบสินค้า" }, { status: 404 });
      }

      return NextResponse.json({ ok: true });
    }

    const { storeId } = await enforcePermission("products.update");
    const payload = normalizeProductPayload(parsed.data.data);
    const result = await updateProductInPostgres({
      storeId,
      productId,
      payload,
    });

    if (!result.ok) {
      return toProductWriteErrorResponse(result.error);
    }

    return NextResponse.json({ ok: true, product: result.product });
  } catch (error) {
    console.error("[PATCH /api/products/:id] error →", error);
    return toRBACErrorResponse(error);
  }
}
