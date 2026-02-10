"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

type OrderRow = {
  orderNo: string;
  customer: string;
  status: "paid" | "pending";
  total: number;
};

const data: OrderRow[] = [
  { orderNo: "SO-1001", customer: "ลูกค้า Walk-in", status: "paid", total: 420 },
  { orderNo: "SO-1002", customer: "คุณปรีชา", status: "pending", total: 960 },
  { orderNo: "SO-1003", customer: "คุณกมล", status: "paid", total: 1350 },
];

const columns: ColumnDef<OrderRow>[] = [
  {
    accessorKey: "orderNo",
    header: "เลขที่บิล",
  },
  {
    accessorKey: "customer",
    header: "ลูกค้า",
  },
  {
    accessorKey: "status",
    header: "สถานะ",
    cell: ({ row }) =>
      row.original.status === "paid" ? (
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
          ชำระแล้ว
        </span>
      ) : (
        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">
          รอชำระ
        </span>
      ),
  },
  {
    accessorKey: "total",
    header: "ยอดรวม",
    cell: ({ row }) => `${row.original.total.toLocaleString("th-TH")} บาท`,
  },
];

export function OrdersTable() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-3 py-2 font-medium">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
