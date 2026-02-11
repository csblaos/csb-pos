"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth/client-token";
import type {
  InventoryMovementView,
  StockProductOption,
} from "@/lib/inventory/queries";

type StockLedgerProps = {
  products: StockProductOption[];
  recentMovements: InventoryMovementView[];
  canCreate: boolean;
  canAdjust: boolean;
  canInbound: boolean;
};

type MovementType = "IN" | "ADJUST" | "RETURN";
type AdjustMode = "INCREASE" | "DECREASE";

const movementLabel: Record<MovementType, string> = {
  IN: "รับเข้า",
  ADJUST: "ปรับสต็อก",
  RETURN: "รับคืน",
};

const movementBadgeClass: Record<InventoryMovementView["type"], string> = {
  IN: "bg-emerald-100 text-emerald-700",
  OUT: "bg-rose-100 text-rose-700",
  RESERVE: "bg-amber-100 text-amber-700",
  RELEASE: "bg-slate-200 text-slate-700",
  ADJUST: "bg-blue-100 text-blue-700",
  RETURN: "bg-purple-100 text-purple-700",
};

const movementTypeLabelMap: Record<InventoryMovementView["type"], string> = {
  IN: "รับเข้า",
  OUT: "ตัดออก",
  RESERVE: "จอง",
  RELEASE: "ยกเลิกจอง",
  ADJUST: "ปรับสต็อก",
  RETURN: "รับคืน",
};

export function StockLedger({
  products,
  recentMovements,
  canCreate,
  canAdjust,
  canInbound,
}: StockLedgerProps) {
  const router = useRouter();

  const movementTypeOptions = useMemo(() => {
    const options: MovementType[] = [];
    if (canInbound) {
      options.push("IN", "RETURN");
    }
    if (canAdjust) {
      options.push("ADJUST");
    }

    return options;
  }, [canAdjust, canInbound]);

  const [productId, setProductId] = useState<string>(products[0]?.productId ?? "");
  const [movementType, setMovementType] = useState<MovementType>(
    movementTypeOptions[0] ?? "IN",
  );
  const [unitId, setUnitId] = useState<string>(products[0]?.unitOptions[0]?.unitId ?? "");
  const [qty, setQty] = useState<string>("1");
  const [adjustMode, setAdjustMode] = useState<AdjustMode>("INCREASE");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => products.find((item) => item.productId === productId),
    [products, productId],
  );

  const selectedUnit = selectedProduct?.unitOptions.find((unit) => unit.unitId === unitId);

  const qtyBasePreview = useMemo(() => {
    const qtyNumber = Number(qty);
    if (!selectedUnit || !Number.isFinite(qtyNumber) || qtyNumber <= 0) {
      return null;
    }

    const computed = qtyNumber * selectedUnit.multiplierToBase;
    const rounded = Math.round(computed);
    if (Math.abs(computed - rounded) > 1e-9) {
      return null;
    }

    if (movementType === "ADJUST" && adjustMode === "DECREASE") {
      return -rounded;
    }

    return rounded;
  }, [adjustMode, movementType, qty, selectedUnit]);

  const onProductChange = (nextProductId: string) => {
    setProductId(nextProductId);
    const product = products.find((item) => item.productId === nextProductId);
    setUnitId(product?.unitOptions[0]?.unitId ?? "");
  };

  const submitMovement = async () => {
    if (!canCreate) {
      setErrorMessage("คุณไม่มีสิทธิ์บันทึกสต็อก");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await authFetch("/api/stock/movements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId,
        movementType,
        unitId,
        qty,
        adjustMode,
        note,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          message?: string;
        }
      | null;

    if (!response.ok) {
      setErrorMessage(data?.message ?? "บันทึกสต็อกไม่สำเร็จ");
      setLoading(false);
      return;
    }

    setSuccessMessage("บันทึกรายการสต็อกเรียบร้อย");
    setNote("");
    setQty("1");
    setLoading(false);
    router.refresh();
  };

  return (
    <section className="space-y-4">
      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">บันทึกการเคลื่อนไหวสต็อก</h2>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="stock-product">
            สินค้า
          </label>
          <select
            id="stock-product"
            value={productId}
            onChange={(event) => onProductChange(event.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
            disabled={loading || products.length === 0}
          >
            {products.map((product) => (
              <option key={product.productId} value={product.productId}>
                {product.sku} - {product.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-type">
              ประเภท
            </label>
            <select
              id="stock-type"
              value={movementType}
              onChange={(event) => setMovementType(event.target.value as MovementType)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={loading || movementTypeOptions.length === 0}
            >
              {movementTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {movementLabel[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-unit">
              หน่วย
            </label>
            <select
              id="stock-unit"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={loading || !selectedProduct}
            >
              {selectedProduct?.unitOptions.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.unitCode} ({unit.unitNameTh})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="stock-qty">
              จำนวน
            </label>
            <input
              id="stock-qty"
              type="number"
              min={0.001}
              step={0.001}
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
              disabled={loading}
            />
          </div>

          {movementType === "ADJUST" ? (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="stock-adjust-mode">
                รูปแบบการปรับ
              </label>
              <select
                id="stock-adjust-mode"
                value={adjustMode}
                onChange={(event) => setAdjustMode(event.target.value as AdjustMode)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none ring-primary focus:ring-2"
                disabled={loading}
              >
                <option value="INCREASE">ปรับเพิ่ม</option>
                <option value="DECREASE">ปรับลด</option>
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="stock-note">
            หมายเหตุ
          </label>
          <textarea
            id="stock-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
            disabled={loading}
          />
        </div>

        <p className="text-xs text-blue-700">
          {selectedUnit && qtyBasePreview !== null
            ? `รายการนี้จะบันทึกเป็น ${qtyBasePreview.toLocaleString("th-TH")} ${selectedProduct?.baseUnitCode ?? "หน่วยหลัก"}`
            : "กรุณากรอกจำนวนให้แปลงเป็นหน่วยหลักได้"}
        </p>

        <Button className="h-10 w-full" onClick={submitMovement} disabled={loading || !canCreate}>
          {loading ? "กำลังบันทึก..." : "บันทึกสต็อก"}
        </Button>
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">สรุปสต็อกปัจจุบัน</h2>

        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีสินค้าในร้าน</p>
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div key={product.productId} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{product.sku}</p>
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      หน่วยหลัก {product.baseUnitCode}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      product.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {product.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-slate-50 p-2">
                    <p className="text-muted-foreground">คงเหลือ</p>
                    <p className="font-semibold">{product.onHand.toLocaleString("th-TH")}</p>
                  </div>
                  <div className="rounded bg-slate-50 p-2">
                    <p className="text-muted-foreground">จอง</p>
                    <p className="font-semibold">{product.reserved.toLocaleString("th-TH")}</p>
                  </div>
                  <div className="rounded bg-slate-50 p-2">
                    <p className="text-muted-foreground">พร้อมขาย</p>
                    <p className={`font-semibold ${product.available < 0 ? "text-red-600" : ""}`}>
                      {product.available.toLocaleString("th-TH")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">สมุดบัญชีสต็อกล่าสุด</h2>

        {recentMovements.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการเคลื่อนไหว</p>
        ) : (
          <div className="space-y-2">
            {recentMovements.map((movement) => (
              <div key={movement.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{movement.productSku}</p>
                    <p className="text-sm font-medium">{movement.productName}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${movementBadgeClass[movement.type]}`}>
                    {movementTypeLabelMap[movement.type]}
                  </span>
                </div>

                <p className="mt-2 text-sm">
                  จำนวนฐาน {movement.qtyBase.toLocaleString("th-TH")}
                </p>

                {movement.note ? (
                  <p className="mt-1 text-xs text-muted-foreground">หมายเหตุ: {movement.note}</p>
                ) : null}

                <p className="mt-1 text-xs text-muted-foreground">
                  โดย {movement.createdByName ?? "-"} • {new Date(movement.createdAt).toLocaleString("th-TH")}
                </p>
              </div>
            ))}
          </div>
        )}
      </article>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </section>
  );
}
