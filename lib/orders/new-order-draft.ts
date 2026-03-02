export const NEW_ORDER_DRAFT_STORAGE_KEY = "csb.orders.new.has_draft";

export function setNewOrderDraftFlag(hasDraft: boolean) {
  if (typeof window === "undefined") return;
  if (hasDraft) {
    window.sessionStorage.setItem(NEW_ORDER_DRAFT_STORAGE_KEY, "1");
    return;
  }
  window.sessionStorage.removeItem(NEW_ORDER_DRAFT_STORAGE_KEY);
}

export function hasNewOrderDraftFlag() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(NEW_ORDER_DRAFT_STORAGE_KEY) === "1";
}
