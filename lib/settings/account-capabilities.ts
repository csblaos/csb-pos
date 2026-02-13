import { isPermissionGranted } from "@/lib/rbac/access";

export type UserCapability = {
  id: string;
  title: string;
  description: string;
  granted: boolean;
};

type CapabilityConfig = {
  id: string;
  permissionKey: string;
  title: string;
  description: string;
};

const capabilityConfigs: CapabilityConfig[] = [
  {
    id: "settings.view",
    permissionKey: "settings.view",
    title: "เข้าหน้าตั้งค่า",
    description: "ดูข้อมูลตั้งค่าร้านและบัญชี",
  },
  {
    id: "settings.update",
    permissionKey: "settings.update",
    title: "แก้ไขข้อมูลร้าน",
    description: "เปลี่ยนชื่อร้าน โลโก้ ที่อยู่ และข้อมูลพื้นฐาน",
  },
  {
    id: "members.view",
    permissionKey: "members.view",
    title: "ดูสมาชิกทีม",
    description: "ดูรายชื่อผู้ใช้และสมาชิกในร้าน",
  },
  {
    id: "rbac.roles.view",
    permissionKey: "rbac.roles.view",
    title: "จัดการบทบาทและสิทธิ์",
    description: "กำหนดว่าแต่ละตำแหน่งทำอะไรได้บ้าง",
  },
  {
    id: "units.view",
    permissionKey: "units.view",
    title: "จัดการหน่วยสินค้า",
    description: "ตั้งค่าหน่วยสินค้า เช่น ชิ้น แพ็ค กล่อง",
  },
  {
    id: "reports.view",
    permissionKey: "reports.view",
    title: "ดูรายงาน",
    description: "ดูยอดขายและข้อมูลสรุปผลการขาย",
  },
  {
    id: "connections.view",
    permissionKey: "connections.view",
    title: "ดูการเชื่อมต่อช่องทาง",
    description: "ตรวจสอบสถานะ Facebook Page และ WhatsApp",
  },
];

export function buildUserCapabilities(permissionKeys: string[]): UserCapability[] {
  return capabilityConfigs.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    granted: isPermissionGranted(permissionKeys, item.permissionKey),
  }));
}
