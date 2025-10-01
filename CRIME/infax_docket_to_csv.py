#!/usr/bin/env python3
"""
Infax Docket Filter GUI (CSV output only)

Rules:
  1) Keep only rows where Column A contains a comma (",").
  2) Remove duplicates by Column B (keep the first occurrence),
     dedupe key is lowercased with collapsed whitespace.

Input:
  • CSV (recommended)
  • Excel .xlsx (optional; requires openpyxl; otherwise save as CSV first)

Output:
  • CSV only (UTF-8 with BOM for Excel)

Install:
  pip install pandas
  # Optional for reading .xlsx:
  # pip install openpyxl
Run:
  python infax_docket_filter_gui.py
"""

import os
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from tkinter.scrolledtext import ScrolledText

try:
    import pandas as pd
except Exception:
    tk.Tk().withdraw()
    messagebox.showerror("Missing dependency",
                         "pandas is required.\n\nInstall:\n  pip install pandas")
    raise

APP_TITLE = "Infax Docket → CSV Filter"
PREVIEW_LIMIT = 500  # rows to show in preview


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1000x680")
        self.minsize(900, 600)

        # Data
        self.df_original = None
        self.df_filtered = None
        self.last_loaded_path = None

        self._build_ui()

    # --------------------------- UI ---------------------------
    def _build_ui(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(2, weight=1)

        top = ttk.Frame(self, padding=10)
        top.grid(row=0, column=0, sticky="ew")
        top.columnconfigure(1, weight=1)

        self.btn_load = ttk.Button(top, text="Load CSV / .xlsx…", command=self.load_file)
        self.btn_load.grid(row=0, column=0, sticky="w")

        self.path_var = tk.StringVar(value="(no file loaded)")
        ttk.Label(top, textvariable=self.path_var).grid(row=0, column=1, sticky="w", padx=8)

        picks = ttk.Frame(self, padding=(10, 0, 10, 0))
        picks.grid(row=1, column=0, sticky="ew")
        for i in range(5):
            picks.columnconfigure(i, weight=1)

        self.col_names = []

        ttk.Label(picks, text="Column A (must contain comma):").grid(row=0, column=0, sticky="w")
        self.colA_var = tk.StringVar()
        self.cmb_colA = ttk.Combobox(picks, textvariable=self.colA_var, state="readonly", values=[])
        self.cmb_colA.grid(row=0, column=1, sticky="ew", padx=(6, 24))

        ttk.Label(picks, text="Column B (dedupe key):").grid(row=0, column=2, sticky="w")
        self.colB_var = tk.StringVar()
        self.cmb_colB = ttk.Combobox(picks, textvariable=self.colB_var, state="readonly", values=[])
        self.cmb_colB.grid(row=0, column=3, sticky="ew", padx=(6, 24))

        self.btn_preview = ttk.Button(picks, text="Preview Filtered", command=self.preview_filtered, state="disabled")
        self.btn_preview.grid(row=0, column=4, sticky="ew")

        # Export CSV only
        self.btn_export_csv = ttk.Button(picks, text="Export CSV…", command=self.export_csv, state="disabled")
        self.btn_export_csv.grid(row=0, column=5, sticky="ew", padx=(10, 0))

        pan = ttk.Panedwindow(self, orient=tk.HORIZONTAL)
        pan.grid(row=2, column=0, sticky="nsew", pady=10, padx=10)

        left = ttk.Frame(pan)
        left.rowconfigure(1, weight=1)
        left.columnconfigure(0, weight=1)
        pan.add(left, weight=3)

        ttk.Label(left, text="Preview").grid(row=0, column=0, sticky="w")

        self.tree = ttk.Treeview(left, columns=(), show="headings", height=16)
        self.tree.grid(row=1, column=0, sticky="nsew")
        self.tree_scroll_y = ttk.Scrollbar(left, orient="vertical", command=self.tree.yview)
        self.tree_scroll_y.grid(row=1, column=1, sticky="ns")
        self.tree_scroll_x = ttk.Scrollbar(left, orient="horizontal", command=self.tree.xview)
        self.tree_scroll_x.grid(row=2, column=0, sticky="ew")
        self.tree.configure(yscrollcommand=self.tree_scroll_y.set, xscrollcommand=self.tree_scroll_x.set)

        self.info_var = tk.StringVar(value="Load a CSV or .xlsx to begin. Export is CSV only.")
        ttk.Label(left, textvariable=self.info_var, foreground="#0a7").grid(row=3, column=0, sticky="w", pady=(6,0))

        right = ttk.Frame(pan)
        right.rowconfigure(1, weight=1)
        right.columnconfigure(0, weight=1)
        pan.add(right, weight=2)

        ttk.Label(right, text="Details / Audit").grid(row=0, column=0, sticky="w")
        self.log = ScrolledText(right, height=16, wrap="word")
        self.log.grid(row=1, column=0, sticky="nsew")

        self.status_var = tk.StringVar(value="")
        ttk.Label(self, textvariable=self.status_var, anchor="w").grid(row=3, column=0, sticky="ew", padx=10, pady=(0,10))

        self._log("Welcome. Load a file to get started.\n")

    # --------------------------- Helpers ---------------------------
    def _log(self, text: str):
        self.log.insert("end", text)
        self.log.see("end")

    def _clear_tree(self):
        for c in self.tree["columns"]:
            self.tree.heading(c, text="")
            self.tree.column(c, width=100, stretch=True)
        self.tree["columns"] = ()
        for iid in self.tree.get_children():
            self.tree.delete(iid)

    def _populate_tree_from_df(self, df: pd.DataFrame, label: str):
        self._clear_tree()
        if df is None or df.empty:
            self.info_var.set(f"{label}: 0 rows")
            return
        cols = list(df.columns)
        self.tree["columns"] = cols
        for c in cols:
            self.tree.heading(c, text=str(c))
            width = min(240, max(80, int(df[c].astype(str).str.len().clip(upper=70).mean()*7)))
            self.tree.column(c, width=width, stretch=True)
        shown = 0
        for _, row in df.head(PREVIEW_LIMIT).iterrows():
            vals = ["" if pd.isna(v) else v for v in row.tolist()]
            self.tree.insert("", "end", values=vals)
            shown += 1
        suffix = f" (showing first {PREVIEW_LIMIT})" if len(df) > PREVIEW_LIMIT else ""
        self.info_var.set(f"{label}: {len(df)} row(s){suffix}")

    def _safe_read(self, path: str) -> pd.DataFrame:
        _, ext = os.path.splitext(path.lower())
        if ext == ".csv":
            # Read everything as string to avoid dtype surprises
            try:
                return pd.read_csv(path, dtype=str)
            except UnicodeDecodeError:
                return pd.read_csv(path, dtype=str, encoding="latin1")
        elif ext == ".xlsx":
            try:
                return pd.read_excel(path, dtype=str)  # let pandas choose engine
            except Exception as e:
                raise RuntimeError(
                    "Could not read .xlsx (openpyxl may be missing). "
                    "Install with: pip install openpyxl\n\nDetails:\n" + str(e)
                )
        elif ext == ".xls":
            raise RuntimeError("Legacy .xls not supported. Open in Excel and Save As CSV or .xlsx.")
        else:
            raise RuntimeError("Unsupported file type. Use .csv or .xlsx")

    # --------------------------- Actions ---------------------------
    def load_file(self):
        path = filedialog.askopenfilename(
            title="Select CSV or Excel (.xlsx)",
            filetypes=[("CSV files","*.csv"), ("Excel .xlsx","*.xlsx"), ("All files","*.*")]
        )
        if not path:
            return
        try:
            df = self._safe_read(path)
        except Exception as e:
            messagebox.showerror("Load error", f"Could not read file:\n\n{e}")
            return

        df.columns = [str(c).replace("\ufeff","").strip() for c in df.columns]
        self.df_original = df.copy()
        self.df_filtered = None
        self.last_loaded_path = path

        self.path_var.set(path)
        self.status_var.set(f"Loaded {len(df)} row(s), {len(df.columns)} column(s).")
        self._log(f"Loaded: {path}\nRows: {len(df)} | Columns: {len(df.columns)}\n\n")

        self.col_names = list(df.columns)
        self.cmb_colA["values"] = self.col_names
        self.cmb_colB["values"] = self.col_names
        if len(self.col_names) >= 1:
            self.colA_var.set(self.col_names[0])
        if len(self.col_names) >= 2:
            self.colB_var.set(self.col_names[1])

        self.btn_preview["state"] = "normal"
        self.btn_export_csv["state"] = "disabled"

        self._populate_tree_from_df(self.df_original, "Original")

    def preview_filtered(self):
        if self.df_original is None:
            messagebox.showinfo("No data", "Load a file first.")
            return
        colA = self.colA_var.get().strip()
        colB = self.colB_var.get().strip()
        missing = [c for c in (colA, colB) if c and c not in self.df_original.columns]
        if missing:
            messagebox.showerror("Column error", f"These columns are not in the file: {missing}")
            return
        if not colA:
            messagebox.showerror("Column A required", "Pick a column for the comma-required rule (Column A).")
            return
        if not colB:
            messagebox.showerror("Column B required", "Pick a column for the de-duplication rule (Column B).")
            return

        df = self.df_original.copy()

        a = df[colA].astype(str).fillna("")
        mask_comma = a.str.contains(",", na=False)
        df1 = df[mask_comma].copy()
        removed_no_comma = (~mask_comma).sum()

        self._log("== Step 1: Column A must contain a comma ==\n")
        self._log(f"Using Column A: {colA}\n")
        if removed_no_comma:
            idxs = df.index[~mask_comma].tolist()
            self._log(f"Removed {removed_no_comma} row(s) without a comma in '{colA}'.\n")
            for ridx in idxs[:50]:
                val = df.at[ridx, colA]
                self._log(f"  - Row {ridx+2} (1-based with header): '{val}'\n")
            if len(idxs) > 50:
                self._log(f"  … and {len(idxs)-50} more.\n")
        else:
            self._log("No rows removed in step 1.\n")
        self._log("\n")

        self._log("== Step 2: Remove duplicates by Column B ==\n")
        self._log(f"Using Column B: {colB} (case-insensitive; whitespace collapsed)\n")
        b_norm = (
            df1[colB].astype(str)
            .fillna("")
            .str.replace(r"\s+", " ", regex=True)
            .str.strip()
            .str.lower()
        )
        df1["_dedupe_key_"] = b_norm
        before = len(df1)
        df2 = df1.drop_duplicates(subset=["_dedupe_key_"], keep="first").drop(columns=["_dedupe_key_"])
        removed_dupes = before - len(df2)

        if removed_dupes:
            self._log(f"Removed {removed_dupes} duplicate row(s) based on '{colB}'.\n\n")
        else:
            self._log("No duplicates found in step 2.\n\n")

        self.df_filtered = df2
        self._populate_tree_from_df(self.df_filtered, "Filtered")
        self.btn_export_csv["state"] = "normal"

        self.status_var.set(
            f"Original: {len(self.df_original)} | "
            f"Removed (no comma in {colA}): {removed_no_comma} | "
            f"Removed (dupes by {colB}): {removed_dupes} | "
            f"Final: {len(self.df_filtered)}"
        )

    def export_csv(self):
        if self.df_filtered is None or self.df_filtered.empty:
            messagebox.showinfo("Nothing to export", "Preview the filtered data first.")
            return

        # Default name: base_filtered.csv
        default_name = "infax_filtered.csv"
        if self.last_loaded_path:
            base = os.path.splitext(os.path.basename(self.last_loaded_path))[0]
            default_name = f"{base}_filtered.csv"

        path = filedialog.asksaveasfilename(
            title="Export filtered as CSV",
            initialfile=default_name,
            defaultextension=".csv",
            filetypes=[("CSV","*.csv")]
        )
        if not path:
            return

        # Ensure .csv extension
        root, ext = os.path.splitext(path)
        if ext.lower() != ".csv":
            path = root + ".csv"

        try:
            # UTF-8 with BOM so Excel auto-detects encoding
            self.df_filtered.to_csv(path, index=False, encoding="utf-8-sig")
        except Exception as e:
            messagebox.showerror("Export failed", f"Could not write CSV:\n\n{e}")
            return

        self.status_var.set(f"Exported CSV: {path}")
        self._log(f"Exported CSV: {path}\n\n")


def main():
    app = App()
    # Optional: nicer theme if available
    try:
        style = ttk.Style()
        if "vista" in style.theme_names():
            style.theme_use("vista")
        elif "clam" in style.theme_names():
            style.theme_use("clam")
    except Exception:
        pass
    app.mainloop()


if __name__ == "__main__":
    main()
