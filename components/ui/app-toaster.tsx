"use client";

import { Toaster } from "react-hot-toast";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      toastOptions={{
        duration: 3000,
        style: {
          borderRadius: "16px",
          border: "1px solid #a7f3d0",
          background: "#ecfdf5",
          color: "#047857",
          fontSize: "14px",
          fontWeight: "500",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.14)",
        },
      }}
      containerStyle={{
        top: 12,
        right: 12,
      }}
    />
  );
}
