
'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./globals.css";

type IncomeRow = { id: string; date: string; desc: string; amount: number; notes?: string };
type ExpenseRow = { id: string; date: string; category: string; desc: string; amount: number; notes?: string };
type Tab = "income" | "expenses" | "summary";
type ToastType = "info" | "success" | "error";
type Toast = { id: string; message: string; type: ToastType };

const RATE_STORAGE_KEY = 'budget_rate';
const RATE_FETCHED_AT_KEY = 'budget_rate_timestamp';
const RATE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

const fmtKRW = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEFAULT_CATEGORIES = [
  'Room and Utility',
  'Daily Expense',
  'Borrow Others',
  'Food & Drinks',
  'Transportation',
  'Entertainment',
  'Shopping',
  'Other'
] as const;

function uid(){ return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
function krwToUsd(krw:number, rate:number){
  const normalizedRate = Number(rate);
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) return 0;
  return Number(krw) / normalizedRate;
}
function esc(str: string){ return String(str).replace(/[&<>"']/g, s => ({'&':'&','<':'<','>':'>','"':'"','\'':"'" }[s] as string)); }

export default function Page(){
  const [rate, setRate] = useState(1388);
  useEffect(()=>{
    try {
      const saved = localStorage.getItem(RATE_STORAGE_KEY);
      if (!saved) return;
      const parsed = Number(saved);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      setRate(parsed);
    } catch (err) {
      console.error('Failed to load saved exchange rate', err);
    }
  }, []);
  // Tabs
  const [tab, setTab] = useState<Tab>('income');
  useEffect(()=>{
    const last = localStorage.getItem('budget_active_tab') as Tab | null;
    if (last) setTab(last);
  }, []);
  useEffect(()=>{ localStorage.setItem('budget_active_tab', tab); }, [tab]);

  // Data
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<string[]>([...DEFAULT_CATEGORIES]);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  function toast(message: string, type: ToastType = 'info', timeout = 2500){
    const id = uid();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(()=> setToasts(t => t.filter(x => x.id !== id)), timeout);
  }

  useEffect(()=>{
    let cancelled = false;
    async function refreshRate(){
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/KRW');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const usdPerKrw = Number(data?.rates?.USD);
        if (!Number.isFinite(usdPerKrw) || usdPerKrw <= 0) throw new Error('Invalid rate data');
        const krwPerUsd = 1 / usdPerKrw;
        if (cancelled) return;
        setRate(krwPerUsd);
        try {
          localStorage.setItem(RATE_STORAGE_KEY, String(krwPerUsd));
          localStorage.setItem(RATE_FETCHED_AT_KEY, String(Date.now()));
        } catch (storageErr) {
          console.error('Failed to persist exchange rate', storageErr);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch KRW to USD rate', err);
        toast('Unable to refresh exchange rate. Using the last known value.', 'error', 4000);
      }
    }

    try {
      const lastFetched = Number(localStorage.getItem(RATE_FETCHED_AT_KEY));
      if (!Number.isFinite(lastFetched) || (Date.now() - lastFetched) > RATE_MAX_AGE_MS){
        refreshRate();
      }
    } catch (err) {
      console.error('Failed to read stored exchange rate timestamp', err);
      refreshRate();
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load / Save
  useEffect(()=>{
    try {
      const inc = JSON.parse(localStorage.getItem('budget_income') || '[]');
      const exp = JSON.parse(localStorage.getItem('budget_expenses') || '[]');
      const cat = JSON.parse(localStorage.getItem('budget_categories') || '[]');
      setIncome(Array.isArray(inc) ? inc : []);
      setExpenses(Array.isArray(exp) ? exp : []);
      const catArr = Array.isArray(cat) && cat.length ? cat : [...DEFAULT_CATEGORIES];
      const expCats = Array.isArray(exp) ? exp.map((e:any)=>e.category).filter(Boolean) : [];
      setCategories(Array.from(new Set([...catArr, ...expCats])));
    } catch {
      setIncome([]); setExpenses([]); setCategories([...DEFAULT_CATEGORIES]);
      toast("Local data was corrupted and has been reset.", "error", 4000);
    }
  }, []);

  useEffect(()=>{
    try {
      localStorage.setItem('budget_income', JSON.stringify(income));
      localStorage.setItem('budget_expenses', JSON.stringify(expenses));
      localStorage.setItem('budget_categories', JSON.stringify(categories));
    } catch {
      toast("Failed to save to local storage.", "error", 3500);
    }
  }, [income, expenses, categories]);

  // Forms refs
  const incomeDateRef = useRef<HTMLInputElement>(null);
  const expenseDateRef = useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const setToday = (el: HTMLInputElement | null) => {
      if (!el || el.value) return;
      const t = new Date();
      const m = String(t.getMonth()+1).padStart(2,'0');
      const d = String(t.getDate()).padStart(2,'0');
      el.value = `${t.getFullYear()}-${m}-${d}`;
    };
    setToday(incomeDateRef.current);
    setToday(expenseDateRef.current);
  }, [tab]);

  // Totals
  const totals = useMemo(()=>{
    const incomeKRW = income.reduce((s,r)=> s + Number(r.amount||0), 0);
    const expenseKRW = expenses.reduce((s,r)=> s + Number(r.amount||0), 0);
    const remainingKRW = incomeKRW - expenseKRW;
    return {
      incomeKRW, expenseKRW, remainingKRW,
      incomeUSD: krwToUsd(incomeKRW, rate),
      expenseUSD: krwToUsd(expenseKRW, rate),
      remainingUSD: krwToUsd(remainingKRW, rate)
    };
  }, [income, expenses, rate]);

  const breakdown = useMemo(()=>{
    const byCat: Record<string, number> = {};
    for (const e of expenses) byCat[e.category] = (byCat[e.category]||0) + Number(e.amount||0);
    return byCat;
  }, [expenses]);

  // Form state
  const [incomeForm, setIncomeForm] = useState({ date: "", desc: "", amount: "", notes: "" });
  const [expenseForm, setExpenseForm] = useState({ date: "", category: "", desc: "", amount: "", notes: "" });
  useEffect(()=>{
    // initialize date fields when forms mount
    if (!incomeForm.date && incomeDateRef.current){
      const t = new Date(); const m = String(t.getMonth()+1).padStart(2,'0'); const d = String(t.getDate()).padStart(2,'0');
      setIncomeForm(f=>({ ...f, date: `${t.getFullYear()}-${m}-${d}` }));
    }
    if (!expenseForm.date && expenseDateRef.current){
      const t = new Date(); const m = String(t.getMonth()+1).padStart(2,'0'); const d = String(t.getDate()).padStart(2,'0');
      setExpenseForm(f=>({ ...f, date: `${t.getFullYear()}-${m}-${d}` }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helpers
  const incomeUSD = useMemo(()=>{
    const v = Number(incomeForm.amount || 0);
    return fmtUSD.format(krwToUsd(v, rate));
  }, [incomeForm.amount, rate]);
  const expenseUSD = useMemo(()=>{
    const v = Number(expenseForm.amount || 0);
    return fmtUSD.format(krwToUsd(v, rate));
  }, [expenseForm.amount, rate]);

  function onAddIncome(e: React.FormEvent){
    e.preventDefault();
    const date = incomeForm.date.trim();
    const desc = incomeForm.desc.trim();
    const amount = Math.round(Number(incomeForm.amount));
    let ok = true;
    if (!date) ok = false;
    if (!desc) ok = false;
    if (!(amount > 0)) ok = false;
    if (!ok) { toast("Please fix the errors above.", "error", 3500); return; }
    const row: IncomeRow = { id: uid(), date, desc, amount, notes: incomeForm.notes.trim() };
    setIncome(v => [...v, row]);
    toast("Income added", "success");
    setIncomeForm(f => ({ date: f.date, desc: "", amount: "", notes: "" }));
  }

  function onAddExpense(e: React.FormEvent){
    e.preventDefault();
    const date = expenseForm.date.trim();
    const category = expenseForm.category.trim();
    const desc = expenseForm.desc.trim();
    const amount = Math.round(Number(expenseForm.amount));
    let ok = true;
    if (!date) ok = false;
    if (!category) ok = false;
    if (!desc) ok = false;
    if (!(amount > 0)) ok = false;
    if (!ok) { toast("Please fix the errors above.", "error", 3500); return; }
    const row: ExpenseRow = { id: uid(), date, category, desc, amount, notes: expenseForm.notes.trim() };
    setExpenses(v => [...v, row]);
    toast("Expense added", "success");
    setExpenseForm(f => ({ date: f.date, category: "", desc: "", amount: "", notes: "" }));
  }

  function onAddCategory(){
    const name = window.prompt('New category name')?.trim();
    if (!name) return;
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())){
      toast('Category already exists', 'error', 3000);
      return;
    }
    setCategories(c => [...c, name]);
    setExpenseForm(f => ({ ...f, category: name }));
    toast('Category added', 'success');
  }

  function onDelete(id: string, type: "income"|"expense"){
    const ok = window.confirm('Delete this record? This cannot be undone.');
    if (!ok) return;
    if (type === "income") setIncome(v => v.filter(r => r.id !== id));
    else setExpenses(v => v.filter(r => r.id !== id));
    toast("Record deleted", "success");
  }

  // Export / Import / Clear
  function exportJSON(){
    const data = { version: 1, rate, exportedAt: new Date().toISOString(), income, expenses, categories };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date();
    const name = `budget_export_${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')}.json`;
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Exported JSON downloaded", "success");
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  function importJSONFromPicker(){
    fileInputRef.current?.click();
  }
  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onerror = () => toast("Failed to read file.", "error", 3500);
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || "{}"));
        if (!obj || !Array.isArray(obj.income) || !Array.isArray(obj.expenses)){
          throw new Error("Invalid format: Missing income/expenses arrays");
        }
        const confirmReplace = window.confirm("Import will REPLACE your current data. Continue?");
        if (!confirmReplace) return;
        const inc: IncomeRow[] = obj.income.map((n:any) => ({ id: n.id || uid(), date: n.date||"", desc: n.desc||"", amount: Math.max(0, Number(n.amount||0)), notes: n.notes||"" }));
        const exp: ExpenseRow[] = obj.expenses.map((n:any) => ({ id: n.id || uid(), date: n.date||"", category: n.category||"Other", desc: n.desc||"", amount: Math.max(0, Number(n.amount||0)), notes: n.notes||"" }));
        const cat: string[] = Array.isArray(obj.categories) && obj.categories.length ? obj.categories.map((c:any) => String(c)) : [...DEFAULT_CATEGORIES];
        setIncome(inc); setExpenses(exp); setCategories(Array.from(new Set([...cat, ...exp.map(e=>e.category)])));
        toast("Import successful", "success");
      } catch (err: any){
        toast("Import failed: " + err.message, "error", 5000);
      }
    };
    reader.readAsText(f);
  }

  function clearAll(){
    const ok = window.confirm('Clear ALL data (income + expenses)? This cannot be undone.');
    if (!ok) return;
    setIncome([]); setExpenses([]); setCategories([...DEFAULT_CATEGORIES]);
    toast("All data cleared", "success");
  }

  return (
    <>
      <header className="app-header">
        <div className="container" style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'14px', flexWrap:'wrap'}}>
          <div className="brand"><span className="dot"></span> Personal Budget Tracker</div>
          <nav className="tabs" role="tablist" aria-label="Budget Tabs">
            <button className="tab-btn" role="tab" aria-selected={tab==='income'} onClick={()=>setTab('income')}>Income</button>
            <button className="tab-btn" role="tab" aria-selected={tab==='expenses'} onClick={()=>setTab('expenses')}>Expenses</button>
            <button className="tab-btn" role="tab" aria-selected={tab==='summary'} onClick={()=>setTab('summary')}>Summary</button>
          </nav>
        </div>
      </header>

      <main className="container">
        {/* Income Tab */}
        <section id="tab-income" className="tab card" role="tabpanel" aria-labelledby="Income" hidden={tab!=='income'}>
          <h2 className="section-title">Add Income</h2>
          <p className="subtle">Enter your income details. USD value is calculated in real-time using a fixed rate: <strong>1 USD = <span id="rateDisplay1">{rate.toLocaleString()}</span> KRW</strong>.</p>

          <form onSubmit={onAddIncome} noValidate>
            <div className="row">
              <div>
                <label htmlFor="income-date">Date *</label>
                <input ref={incomeDateRef} type="date" id="income-date" required value={incomeForm.date} onChange={(e)=>setIncomeForm(f=>({...f, date:e.target.value}))} />
              </div>
              <div>
                <label htmlFor="income-desc">Description *</label>
                <input type="text" id="income-desc" required placeholder="e.g., Salary" maxLength={100} value={incomeForm.desc} onChange={(e)=>setIncomeForm(f=>({...f, desc:e.target.value}))} />
              </div>
              <div>
                <label htmlFor="income-amount">Amount (KRW) *</label>
                <input type="number" id="income-amount" required min={1} step={1} inputMode="numeric" placeholder="e.g., 1500000" value={incomeForm.amount} onChange={(e)=>setIncomeForm(f=>({...f, amount:e.target.value}))} />
                <div className="field-hint"><span className="convert-chip">USD ≈ <span id="income-usd">{incomeUSD}</span></span></div>
              </div>
              <div>
                <label htmlFor="income-notes">Notes</label>
                <textarea id="income-notes" placeholder="Optional" value={incomeForm.notes} onChange={(e)=>setIncomeForm(f=>({...f, notes:e.target.value}))} />
              </div>
            </div>
            <div className="actions" style={{marginTop:12}}>
              <button className="btn btn-success" type="submit">Add Income</button>
              <button className="btn btn-ghost" type="button" onClick={()=>setIncomeForm(f=>({ date:f.date, desc:"", amount:"", notes:"" }))}>Reset</button>
            </div>
          </form>

          <div className="table-wrap" style={{marginTop:18}}>
            <table id="income-table" aria-label="Income Records">
              <thead>
                <tr><th>Date</th><th>Description</th><th>Amount (KRW)</th><th>Amount (USD)</th><th>Notes</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {[...income].sort((a,b)=> (b.date||"").localeCompare(a.date||"")).map(row => (
                  <tr key={row.id}>
                    <td>{row.date || ""}</td>
                    <td>{row.desc}</td>
                    <td><span className="pill green">{fmtKRW.format(row.amount)}</span></td>
                    <td>{fmtUSD.format(krwToUsd(row.amount, rate))}</td>
                    <td>{row.notes || ""}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={()=>onDelete(row.id, "income")} aria-label="Delete income">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Expenses Tab */}
        <section id="tab-expenses" className="tab card" role="tabpanel" aria-labelledby="Expenses" hidden={tab!=='expenses'}>
          <h2 className="section-title">Add Expense</h2>
          <p className="subtle">Track your spending by category. USD value is calculated in real-time using <strong>1 USD = <span id="rateDisplay2">{rate.toLocaleString()}</span> KRW</strong>.</p>

          <form onSubmit={onAddExpense} noValidate>
            <div className="row">
              <div>
                <label htmlFor="expense-date">Date *</label>
                <input ref={expenseDateRef} type="date" id="expense-date" required value={expenseForm.date} onChange={(e)=>setExpenseForm(f=>({...f, date:e.target.value}))} />
              </div>
              <div>
                <label htmlFor="expense-category">Category *</label>
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <select id="expense-category" required value={expenseForm.category} onChange={(e)=>setExpenseForm(f=>({...f, category:e.target.value}))}>
                    <option value="">Select a category</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" className="btn btn-sm" onClick={onAddCategory} aria-label="Add category">Add</button>
                </div>
              </div>
              <div>
                <label htmlFor="expense-desc">Description *</label>
                <input type="text" id="expense-desc" required placeholder="e.g., Groceries" maxLength={100} value={expenseForm.desc} onChange={(e)=>setExpenseForm(f=>({...f, desc:e.target.value}))} />
              </div>
              <div>
                <label htmlFor="expense-amount">Amount (KRW) *</label>
                <input type="number" id="expense-amount" required min={1} step={1} inputMode="numeric" placeholder="e.g., 35000" value={expenseForm.amount} onChange={(e)=>setExpenseForm(f=>({...f, amount:e.target.value}))} />
                <div className="field-hint"><span className="convert-chip">USD ≈ <span id="expense-usd">{expenseUSD}</span></span></div>
              </div>
              <div style={{gridColumn: "1 / -1"}}>
                <label htmlFor="expense-notes">Notes</label>
                <textarea id="expense-notes" placeholder="Optional" value={expenseForm.notes} onChange={(e)=>setExpenseForm(f=>({...f, notes:e.target.value}))} />
              </div>
            </div>
            <div className="actions" style={{marginTop:12}}>
              <button className="btn btn-primary" type="submit">Add Expense</button>
              <button className="btn btn-ghost" type="button" onClick={()=>setExpenseForm(f=>({ date:f.date, category:"", desc:"", amount:"", notes:"" }))}>Reset</button>
            </div>
          </form>

          <div className="table-wrap" style={{marginTop:18}}>
            <table id="expense-table" aria-label="Expense Records">
              <thead>
                <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount (KRW)</th><th>Amount (USD)</th><th>Notes</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {[...expenses].sort((a,b)=> (b.date||"").localeCompare(a.date||"")).map(row => (
                  <tr key={row.id}>
                    <td>{row.date || ""}</td>
                    <td>{row.category}</td>
                    <td>{row.desc}</td>
                    <td><span className="pill red">{fmtKRW.format(row.amount)}</span></td>
                    <td>{fmtUSD.format(krwToUsd(row.amount, rate))}</td>
                    <td>{row.notes || ""}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={()=>onDelete(row.id, "expense")} aria-label="Delete expense">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Summary Tab */}
        <section id="tab-summary" className="tab card" role="tabpanel" aria-labelledby="Summary" hidden={tab!=='summary'}>
          <h2 className="section-title">Summary</h2>
          <p className="subtle">Overview of totals and spending distribution. Data is saved locally in your browser. Use export/import to move between devices.</p>

          <div className="summary-cards">
            <div className="summary-card income-card">
              <h3>Income</h3>
              <div className="big" id="sum-income-krw">{fmtKRW.format(totals.incomeKRW)}</div>
              <div className="sub">≈ <strong id="sum-income-usd">{fmtUSD.format(totals.incomeUSD)}</strong></div>
            </div>
            <div className="summary-card expense-card">
              <h3>Expenses</h3>
              <div className="big" id="sum-expense-krw">{fmtKRW.format(totals.expenseKRW)}</div>
              <div className="sub">≈ <strong id="sum-expense-usd">{fmtUSD.format(totals.expenseUSD)}</strong></div>
            </div>
            <div className="summary-card remain-card">
              <h3>Remaining</h3>
              <div className="big" id="sum-remaining-krw">{fmtKRW.format(totals.remainingKRW)}</div>
              <div className="sub">≈ <strong id="sum-remaining-usd">{fmtUSD.format(totals.remainingUSD)}</strong></div>
            </div>
          </div>

          <div className="currency-boxes">
            <div className="currency-box krw-box">
              <div>KRW Total</div>
              <div className="value" id="currency-krw-box">{fmtKRW.format(totals.remainingKRW)}</div>
            </div>
            <div className="currency-box usd-box">
              <div>USD Total</div>
              <div className="value" id="currency-usd-box">{fmtUSD.format(totals.remainingUSD)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2">
            <div className="card">
              <h2 className="section-title">Expense Category Breakdown</h2>
              <p className="subtle">Percentages are relative to total expenses.</p>
              <div className="table-wrap breakdown">
                <table id="breakdown-table" aria-label="Category Breakdown">
                  <thead><tr><th>Category</th><th>KRW</th><th>%</th></tr></thead>
                  <tbody>
                    {categories.map(cat => {
                      const amt = breakdown[cat] || 0;
                      const pct = (amt / (totals.expenseKRW || 1)) * 100;
                      return (
                        <tr key={cat}>
                          <td>{cat}</td>
                          <td>{fmtKRW.format(amt)}</td>
                          <td style={{minWidth:180}}>
                            <div className="bar" title={`${pct.toFixed(1)}%`}><span style={{width:`${pct.toFixed(2)}%`}}></span></div>
                            <div className="subtle">{pct.toFixed(1)}%</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <h2 className="section-title">Data Controls</h2>
              <p className="subtle">Export your data to a JSON file or import it back later. Clearing data cannot be undone.</p>
              <div className="actions" style={{marginTop:12}}>
                <button className="btn" onClick={exportJSON}>Export JSON</button>
                <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={onFilePicked} />
                <button className="btn" onClick={importJSONFromPicker}>Import JSON</button>
                <button className="btn btn-danger" onClick={clearAll}>Clear All Data</button>
              </div>
              <p className="subtle" style={{marginTop:12}}>Import replaces existing data after confirmation. Expected format: {'{ rate, income:[...], expenses:[...], categories:[...] }'}.</p>
            </div>
          </div>
        </section>
      </main>

      <div className="toasts" aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>

      <footer>
        <div className="muted">Made for fast, reliable personal budgeting. Data stays in your browser. Fixed rate: 1 USD = {rate.toLocaleString()} KRW.</div>
      </footer>

    </>
  );
}
