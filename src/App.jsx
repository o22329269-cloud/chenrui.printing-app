import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, FileText, Layers, PackageSearch, PackageCheck, Route,
  ClipboardList, Lock, X, History, CheckCircle2, ArrowRight,
  Building2, Search, ChevronRight, ChevronLeft, Plus, Truck, Send, ChevronUp, ChevronDown,
  Pencil, Trash2, Undo2, AlertTriangle, Settings, Users, LogIn, LogOut, Loader2, Mail
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   雲端連線設定（登入、資料保存、跨裝置同步）
   ============================================================
   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 需在 Vercel「Environment
   Variables」或本機 .env 檔設定。兩者若沒設定，系統會自動切回「示範模式」
   （不登入、資料只存在這次瀏覽中，重新整理會消失）——方便在 Claude 對話框
   裡直接預覽介面，不會因為缺少雲端設定而整個當掉。
   ============================================================ */
const SUPABASE_URL = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : undefined;
const SUPABASE_ANON_KEY = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined;
const CLOUD_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase = CLOUD_ENABLED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const APP_STATE_ROW_ID = 1;

/* ============================================================
   uid / date helpers（demo 用，正式環境請由後端產生）
   ============================================================ */
let __uidCounter = 0;
function uid(prefix) {
  __uidCounter += 1;
  return `${prefix}-${__uidCounter}`;
}
function formattedToday() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}
// 點1：完成訂單／完成任務用的完整日期＋時間
function formattedDateTime() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}
function sortByRecent(list) {
  return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
// 點4：獨立版製作進度表依「進入獨立版製作中」的日期固定排序，不受後續編輯（如加工站日期）影響
function sortByProductionDate(list) {
  return [...list].sort((a, b) => {
    const da = a.productionStartDate, db = b.productionStartDate;
    if (da && db) {
      const [am, ad] = da.split("/").map(Number);
      const [bm, bd] = db.split("/").map(Number);
      return (bm * 100 + bd) - (am * 100 + ad);
    }
    if (da && !db) return -1;
    if (!da && db) return 1;
    return a.id - b.id;
  });
}

/* ============================================================
   一、常數與資料模型定義
   ============================================================ */

// 點3：職位分為四種。MANAGER／DESIGN 底層代碼沿用舊值（admin_sales／design_prepress），
// 這樣已經同步到雲端的人員資料不會因為改版而對不上、被鎖在外面；SALES 是全新加入的角色。
const ROLE = { MANAGER: "admin_sales", SALES: "sales", DESIGN: "design_prepress", DELIVERY: "delivery" };

const ROLE_LABELS = {
  [ROLE.MANAGER]: "主管",
  [ROLE.SALES]: "業務",
  [ROLE.DESIGN]: "設計",
  [ROLE.DELIVERY]: "外務",
};

const ROLE_DESC = {
  [ROLE.MANAGER]: "最高權限，預設全區塊可瀏覽／操作／刪除／清空，「權限管理」僅主管可開啟",
  [ROLE.SALES]: "可使用區塊依主管於「權限管理」設定為準",
  [ROLE.DESIGN]: "可使用區塊依主管於「權限管理」設定為準",
  [ROLE.DELIVERY]: "可使用區塊依主管於「權限管理」設定為準",
};

const MODULE = {
  DASHBOARD: "dashboard",
  QUOTATION: "quotation",
  PREPRESS: "prepress",
  PRODUCTION_QC: "production_qc",
  ARRIVAL: "arrival",
  SHIPPING: "shipping",
  DELIVERY_ROUTE: "delivery_route",
  PLATE_PROGRESS: "plate_progress",
  COMPLETED: "completed_orders",
  COMPLETED_TASKS: "completed_tasks",
};

const MODULE_META = [
  { key: MODULE.DASHBOARD, label: "儀表板", icon: LayoutDashboard },
  { key: MODULE.QUOTATION, label: "報價&接單", icon: FileText },
  { key: MODULE.PREPRESS, label: "印前作業", icon: Layers },
  { key: MODULE.PRODUCTION_QC, label: "製作中", icon: PackageSearch },
  { key: MODULE.PLATE_PROGRESS, label: "獨立版製作進度表", icon: History },
  { key: MODULE.ARRIVAL, label: "到貨與出貨管理", icon: PackageCheck },
  { key: MODULE.DELIVERY_ROUTE, label: "路線安排", icon: Route },
  { key: MODULE.COMPLETED, label: "已完成訂單", icon: CheckCircle2 },
  { key: MODULE.COMPLETED_TASKS, label: "已完成任務", icon: ClipboardList },
];

// 點2：權限細分為 可瀏覽(view)／可執行動作(act)／可刪除或改變順序(del)／可清空(clear)
const PERM_FLAGS = ["view", "act", "del", "clear"];
const PERM_FLAG_LABELS = { view: "可瀏覽", act: "可執行動作", del: "可刪除或改順序", clear: "可清空" };

function buildPermissions(moduleKeys, flags) {
  const out = {};
  Object.values(MODULE).forEach((m) => {
    out[m] = { view: false, act: false, del: false, clear: false };
  });
  moduleKeys.forEach((m) => { out[m] = { ...flags }; });
  return out;
}
function clonePermissions(p) {
  const out = {};
  Object.keys(p).forEach((k) => { out[k] = { ...p[k] }; });
  return out;
}
function hasPerm(permissions, moduleKey, flag) {
  return !!(permissions && permissions[moduleKey] && permissions[moduleKey][flag]);
}

// 預設角色權限樣板（新增人員時的預設值，實際權限之後可在「權限管理」逐項調整，點8）
const DEFAULT_ROLE_PERMISSIONS = {
  [ROLE.MANAGER]: buildPermissions(Object.values(MODULE), { view: true, act: true, del: true, clear: true }),
  [ROLE.SALES]: buildPermissions(
    [MODULE.DASHBOARD, MODULE.QUOTATION, MODULE.ARRIVAL, MODULE.COMPLETED],
    { view: true, act: true, del: false, clear: false }
  ),
  [ROLE.DESIGN]: buildPermissions(
    [MODULE.DASHBOARD, MODULE.PREPRESS, MODULE.PRODUCTION_QC, MODULE.PLATE_PROGRESS],
    { view: true, act: true, del: false, clear: false }
  ),
  [ROLE.DELIVERY]: buildPermissions(
    [MODULE.DASHBOARD, MODULE.ARRIVAL, MODULE.SHIPPING, MODULE.DELIVERY_ROUTE, MODULE.PLATE_PROGRESS, MODULE.COMPLETED_TASKS],
    { view: true, act: true, del: false, clear: false }
  ),
};

const STAGES = [
  { no: 1, label: "階段一・報價與接單", bar: "bg-cyan-500", text: "text-cyan-700", chip: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { no: 2, label: "階段二・印前製版", bar: "bg-fuchsia-500", text: "text-fuchsia-700", chip: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  { no: 3, label: "階段三・製作中（獨立版／合版）", bar: "bg-amber-400", text: "text-amber-700", chip: "bg-amber-50 text-amber-800 border-amber-200" },
  { no: 4, label: "階段四・到貨、品管與物流", bar: "bg-slate-800", text: "text-slate-800", chip: "bg-slate-100 text-slate-700 border-slate-300" },
  { no: 5, label: "階段五・已完成訂單", bar: "bg-emerald-700", text: "text-emerald-800", chip: "bg-emerald-50 text-emerald-800 border-emerald-300" },
];

const STAGE_BORDER_CLASS = {
  1: "border-l-cyan-500",
  2: "border-l-fuchsia-500",
  3: "border-l-amber-400",
  4: "border-l-slate-800",
  5: "border-l-emerald-700",
};

const S = {
  QUOTE_PENDING: "A-1", QUOTE_DONE: "A-2", NEED_NEGOTIATE: "A-3.1", PRODUCIBLE: "A-3.2",
  FILE_CHECKING: "B-1",
  IND_NEW_PROOF: "B-2.A.N.1", IND_NEW_CONFIRMED: "B-2.A.N.2", IND_NEW_PLATEOUT: "B-2.A.N.3",
  IND_OLD: "B-2.A.2", COMBINED: "B-2.2",
  IND_PRODUCTION: "C-1.IND", COMBINED_PRODUCTION: "C-1.COM",
  QC_FAIL: "C-2",
  ARRIVAL: "ARR", SHIPPING_OUT: "SHIP", DELIVERY_ROUTE: "ROUTE",
};

const STATUS_META = {
  [S.QUOTE_PENDING]: { label: "待報價", stage: 1, module: MODULE.QUOTATION },
  [S.QUOTE_DONE]: { label: "已報價", stage: 1, module: MODULE.QUOTATION },
  [S.NEED_NEGOTIATE]: { label: "需議價", stage: 1, module: MODULE.QUOTATION },
  [S.PRODUCIBLE]: { label: "可製作", stage: 1, module: MODULE.QUOTATION },
  [S.FILE_CHECKING]: { label: "已來檔核對中", stage: 2, module: MODULE.PREPRESS },
  [S.IND_NEW_PROOF]: { label: "獨立版・取數位樣", stage: 2, module: MODULE.PREPRESS },
  [S.IND_NEW_CONFIRMED]: { label: "獨立版・送樣確認未改", stage: 2, module: MODULE.PREPRESS },
  [S.IND_NEW_PLATEOUT]: { label: "獨立版・新版(可出版)", stage: 2, module: MODULE.PREPRESS },
  [S.IND_OLD]: { label: "獨立版・舊版沿用", stage: 2, module: MODULE.PREPRESS },
  [S.COMBINED]: { label: "合版物件(未發稿)", stage: 2, module: MODULE.PREPRESS },
  [S.IND_PRODUCTION]: { label: "獨立版製作中", stage: 3, module: MODULE.PLATE_PROGRESS },
  [S.COMBINED_PRODUCTION]: { label: "合版製作中", stage: 3, module: MODULE.PRODUCTION_QC },
  [S.ARRIVAL]: { label: "到貨", stage: 4, module: MODULE.ARRIVAL },
  [S.QC_FAIL]: { label: "品管未通過", stage: 4, module: MODULE.ARRIVAL },
  [S.SHIPPING_OUT]: { label: "已開單待出貨", stage: 4, module: MODULE.SHIPPING },
  [S.DELIVERY_ROUTE]: { label: "已完成訂單", stage: 5, module: MODULE.COMPLETED },
};

const PLATE_SETUP_STATUSES = [S.IND_NEW_PLATEOUT, S.IND_OLD];

function isPlateProgressReady(order) {
  return !!(order.items && order.items.length > 0 && order.items.every((it) => it.steps && it.steps.length > 0));
}

// 防呆：獨立版製作中，需所有物件的所有加工站皆已勾選「完成」才可進入到貨
function isProductionFullyDone(order) {
  if (!order.items || order.items.length === 0) return false;
  return order.items.every((it) => it.steps && it.steps.length > 0 && it.steps.every((s) => s.done));
}
function getUnfinishedItemNames(order) {
  if (!order.items) return [];
  return order.items.filter((it) => !it.steps || it.steps.length === 0 || it.steps.some((s) => !s.done)).map((it) => it.name);
}

// 點2：計算物件目前所在加工站與送達開始製作日期
function getItemCurrentStation(item) {
  if (!item.steps || item.steps.length === 0) return { label: "尚未設定加工站", startDate: null, done: false };
  const idx = item.steps.findIndex((s) => !s.done);
  if (idx === -1) return { label: "已完成所有加工", startDate: null, done: true };
  const step = item.steps[idx];
  return { label: step.label || `加工${idx + 1}（未命名）`, startDate: step.startDate || null, done: false };
}

const INDEPENDENT_STATUSES = [S.IND_NEW_PROOF, S.IND_NEW_CONFIRMED, S.IND_NEW_PLATEOUT, S.IND_OLD, S.IND_PRODUCTION];
const COMBINED_STATUSES = [S.COMBINED, S.COMBINED_PRODUCTION];
const GREEN_VISUAL = { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", borderClass: "border-l-emerald-500", text: "text-emerald-700" };
const RED_VISUAL = { bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200", borderClass: "border-l-rose-500", text: "text-rose-700" };

function stageVisual(order) {
  const meta = STATUS_META[order.status];
  if (order.status === S.QC_FAIL) return RED_VISUAL;
  if (INDEPENDENT_STATUSES.includes(order.status)) return GREEN_VISUAL;
  if (COMBINED_STATUSES.includes(order.status)) return RED_VISUAL;
  const stage = STAGES.find((s) => s.no === meta.stage);
  return { bar: stage.bar, chip: stage.chip, borderClass: STAGE_BORDER_CLASS[meta.stage], text: stage.text };
}

const TRANSITIONS = {
  [S.QUOTE_PENDING]: [{
    label: "完成報價", to: S.QUOTE_DONE, variant: "primary",
    isQuoteForm: true,
  }],
  [S.QUOTE_DONE]: [
    { label: "需議價（退回待報價）", to: S.NEED_NEGOTIATE, variant: "warn" },
    { label: "確認可製作", to: S.PRODUCIBLE, variant: "primary" },
  ],
  [S.NEED_NEGOTIATE]: [{ label: "重新報價", to: S.QUOTE_PENDING, variant: "primary" }],
  [S.PRODUCIBLE]: [{ label: "來檔核對", to: S.FILE_CHECKING, variant: "primary" }],
  [S.FILE_CHECKING]: [
    { label: "獨立版・新版", to: S.IND_NEW_PROOF, variant: "primary", setPlateType: "independent", setPlateMode: "new" },
    { label: "獨立版・舊版沿用", to: S.IND_OLD, variant: "primary", setPlateType: "independent", setPlateMode: "old" },
    { label: "合版物件(未發稿)", to: S.COMBINED, variant: "primary", setPlateType: "combined" },
  ],
  [S.IND_NEW_PROOF]: [{ label: "送樣確認未改", to: S.IND_NEW_CONFIRMED, variant: "primary" }],
  [S.IND_NEW_CONFIRMED]: [{ label: "確認出版", to: S.IND_NEW_PLATEOUT, variant: "primary" }],
  [S.IND_NEW_PLATEOUT]: [],
  [S.IND_OLD]: [],
  [S.COMBINED]: [{ label: "進入合版製作中", to: S.COMBINED_PRODUCTION, variant: "primary" }],
  [S.IND_PRODUCTION]: [{ label: "完成製作 → 到貨", to: S.ARRIVAL, variant: "primary", requiresAllStepsDone: true }],
  [S.COMBINED_PRODUCTION]: [{ label: "完成製作 → 到貨", to: S.ARRIVAL, variant: "primary" }],
  [S.ARRIVAL]: [
    { label: "開單出貨", to: S.SHIPPING_OUT, variant: "primary", fields: [{ key: "shippingNote", label: "出貨備註（裝箱方式、庫存數量等，選填）", type: "text" }] },
    { label: "品管未通過", to: S.QC_FAIL, variant: "danger", fields: [{ key: "defectReason", label: "不合格原因", type: "text", required: true }] },
  ],
  [S.QC_FAIL]: [{ label: "退回重新製作", variant: "danger", dynamicTarget: true }],
  [S.SHIPPING_OUT]: [{
    label: "安排送貨路線", to: S.DELIVERY_ROUTE, variant: "primary",
    fields: [
      { key: "sequence", label: "排序順序（數字，越小越先）", type: "text", required: true },
      { key: "managerNote", label: "主管備註", type: "text" },
    ],
  }],
  [S.DELIVERY_ROUTE]: [],
};

const MODULE_STATUS_MAP = {
  [MODULE.QUOTATION]: [S.QUOTE_PENDING, S.QUOTE_DONE, S.NEED_NEGOTIATE, S.PRODUCIBLE],
  [MODULE.PREPRESS]: [S.FILE_CHECKING, S.IND_NEW_PROOF, S.IND_NEW_CONFIRMED, S.IND_NEW_PLATEOUT, S.IND_OLD, S.COMBINED],
  [MODULE.PRODUCTION_QC]: [S.IND_PRODUCTION, S.COMBINED_PRODUCTION],
  [MODULE.ARRIVAL]: [S.ARRIVAL, S.QC_FAIL, S.SHIPPING_OUT],
};

const DELIVERY_DASHBOARD_STATUSES = [S.IND_NEW_PLATEOUT, S.IND_PRODUCTION, S.ARRIVAL, S.QC_FAIL, S.SHIPPING_OUT, S.DELIVERY_ROUTE];

const ROUTINE_PRODUCTS = ["名片", "貼紙", "DM", "布條", "其他（自行輸入）"];

const TASK_TYPE_LABELS = {
  delivery: "出貨配送",
  pickup: "加工取件",
  transfer: "轉送下一站",
  sample_pickup: "客戶取樣",
  sample_deliver: "客戶送樣",
  manual_pickup: "取件",
  manual_delivery: "送件",
  invoice: "送發票", // 舊資料相容用，新增任務選單已不提供
  custom: "其他",
};
const TASK_TYPE_BADGE = {
  delivery: "bg-slate-100 text-slate-700 border-slate-300",
  pickup: "bg-emerald-50 text-emerald-700 border-emerald-200",
  transfer: "bg-cyan-50 text-cyan-700 border-cyan-200",
  sample_pickup: "bg-amber-50 text-amber-700 border-amber-200",
  sample_deliver: "bg-amber-50 text-amber-700 border-amber-200",
  manual_pickup: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual_delivery: "bg-cyan-50 text-cyan-700 border-cyan-200",
  invoice: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  custom: "bg-slate-50 text-slate-500 border-slate-200",
};
// 點3：「新增任務」下拉選單只提供這幾種（其餘為系統自動產生或舊資料相容用）
const MANUAL_TASK_TYPES = ["sample_pickup", "sample_deliver", "manual_pickup", "manual_delivery", "custom"];
const STRUCTURED_TASK_TYPES = ["pickup", "transfer"];

/* ============================================================
   二、模擬資料
   ============================================================ */

function makeOrder(id, orderNo, customer, product, qty, status, extra = {}) {
  return {
    id, orderNo, customer, product, qty,
    status, meta: {}, plateType: null, plateMode: null, items: [],
    paper: null, postProcessing: null, quotePrice: null, quoteOptions: [],
    routine: false, reworkFlag: false, reworkAt: null,
    routeArranged: false, productionStartDate: null, completedAt: null,
    updatedAt: Date.now(),
    history: [{ from: null, to: status, by: "系統", at: "2026/07/0" + ((id % 8) + 1), note: "建立訂單" }],
    ...extra,
  };
}

function initialOrders() {
  return [
    makeOrder(1, "CR-2026-0101", "台北星辰貿易", "彩色名片 500 張", 500, S.QUOTE_PENDING, { paper: "300gsm 雪銅卡", postProcessing: "無" }),
    makeOrder(26, "CR-2026-0126", "赤崁蜜餞行", "禮盒 貼標", 1200, S.QUOTE_PENDING, {
      paper: "貼紙專用紙", postProcessing: "無", quotePrice: "1200個 NT$6,800",
      history: [
        { from: null, to: S.QUOTE_PENDING, by: "系統", at: "07/06", note: "建立訂單" },
        { from: S.QUOTE_PENDING, to: S.QUOTE_DONE, by: "業務／主管", at: "07/07", note: "完成報價" },
        { from: S.QUOTE_DONE, to: S.NEED_NEGOTIATE, by: "業務／主管", at: "07/08", note: "需議價（退回待報價）" },
        { from: S.NEED_NEGOTIATE, to: S.QUOTE_PENDING, by: "業務／主管", at: "07/08", note: "重新報價" },
      ],
    }),
    makeOrder(2, "CR-2026-0102", "橘子文具行", "型錄 A4 32P", 2000, S.QUOTE_DONE, { paper: "157gsm 銅版紙", postProcessing: "騎馬釘" }),
    makeOrder(3, "CR-2026-0103", "喜悅婚顧", "喜帖 燙金", 300, S.NEED_NEGOTIATE, { paper: "250gsm 珍珠卡", postProcessing: "燙金" }),
    makeOrder(4, "CR-2026-0104", "晨光食品", "貼標紙 防水", 5000, S.PRODUCIBLE, {
      paper: "防水合成紙", postProcessing: "上光",
      quotePrice: "3000個 NT$8,400、5000個 NT$12,500、10000個 NT$21,000",
      quoteOptions: [
        { qty: "3000", unitPrice: "2.8", total: "8400" },
        { qty: "5000", unitPrice: "2.5", total: "12500" },
        { qty: "10000", unitPrice: "2.1", total: "21000" },
      ],
    }),
    makeOrder(5, "CR-2026-0105", "藍海科技", "產品手冊 20P", 1000, S.FILE_CHECKING, { paper: "157gsm 銅版紙", postProcessing: "膠裝" }),
    makeOrder(6, "CR-2026-0106", "大安診所", "診所海報 A2", 50, S.IND_NEW_PROOF, { plateType: "independent", plateMode: "new", paper: "157gsm 銅版紙", postProcessing: "無" }),
    makeOrder(7, "CR-2026-0107", "小森咖啡", "杯套 單色", 3000, S.IND_NEW_CONFIRMED, { plateType: "independent", plateMode: "new", paper: "牛皮紙", postProcessing: "軋型" }),
    makeOrder(8, "CR-2026-0108", "誠品書店合作社", "書籍封面 精裝", 800, S.IND_NEW_PLATEOUT, { plateType: "independent", plateMode: "new", paper: "250gsm 美術紙", postProcessing: "燙金＋軋型" }),
    makeOrder(9, "CR-2026-0109", "永昌五金", "型錄舊版加印", 1500, S.IND_OLD, { plateType: "independent", plateMode: "old", paper: "157gsm 銅版紙", postProcessing: "無" }),
    makeOrder(10, "CR-2026-0110", "多多寵物", "DM 傳單 合版", 10000, S.COMBINED, { plateType: "combined", paper: "128gsm 銅版紙", postProcessing: "無" }),
    makeOrder(11, "CR-2026-0111", "日昇建設", "桌曆 13 頁", 200, S.COMBINED_PRODUCTION, { plateType: "combined", paper: "230gsm 美術紙", postProcessing: "打孔＋線圈", productionStartDate: "07/05" }),
    makeOrder(12, "CR-2026-0112", "青田素食", "菜單摺頁", 600, S.QC_FAIL, { plateType: "combined", paper: "200gsm 雪銅卡", postProcessing: "摺頁", meta: { 不合格原因: "四色套印偏移" }, productionStartDate: "07/03", quotePrice: "600個 NT$8,400" }),
    makeOrder(13, "CR-2026-0113", "新葉法律事務所", "信封 燙銀", 2000, S.ARRIVAL, { paper: "120gsm 模造紙", postProcessing: "燙銀", productionStartDate: "07/02", quotePrice: "2000個 NT$15,600" }),
    makeOrder(14, "CR-2026-0114", "禾風設計工作室", "提袋 牛皮紙", 1200, S.SHIPPING_OUT, { paper: "牛皮紙", postProcessing: "打孔穿繩", productionStartDate: "07/01", quotePrice: "1200個 NT$22,000" }),
    makeOrder(15, "CR-2026-0115", "泰美旅行社", "旅遊手冊", 3000, S.DELIVERY_ROUTE, { paper: "157gsm 銅版紙", postProcessing: "膠裝", productionStartDate: "06/28", quotePrice: "3000個 NT$68,000" }),
    makeOrder(17, "CR-2026-0117", "康是美藥局", "海報 A1", 100, S.ARRIVAL, { paper: "150gsm 銅版紙", postProcessing: "無", productionStartDate: "07/06", quotePrice: "100個 NT$3,200" }),
    makeOrder(18, "CR-2026-0118", "小可甜點", "貼標 圓形", 8000, S.SHIPPING_OUT, { paper: "貼紙專用紙", postProcessing: "圓形裁型", productionStartDate: "07/04", routeArranged: false, quotePrice: "8000個 NT$9,600" }),
    makeOrder(24, "CR-2026-0124", "全興包裝", "彩盒（退回補件件）", 500, S.IND_PRODUCTION, {
      plateType: "independent", plateMode: "new", reworkFlag: true, reworkAt: "07/08", paper: "300gsm 灰底卡", postProcessing: "燙金＋軋型",
      productionStartDate: "07/01",
      items: [{ id: uid("item"), name: "彩盒外盒", steps: [
        { id: uid("step"), label: "牧源燙金", done: true, scheduled: null, startDate: "07/01" },
        { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: "07/08" },
      ]}],
    }),
    makeOrder(25, "CR-2026-0125", "港都五金", "貼紙 圓標", 2000, S.IND_NEW_PLATEOUT, { plateType: "independent", plateMode: "new", paper: "貼紙專用紙", postProcessing: "圓形裁型" }),

    makeOrder(19, "20260706001", "雨晴", "氣味展組合", 1, S.IND_PRODUCTION, {
      plateType: "independent", plateMode: "new", paper: "300gsm 灰底卡", postProcessing: "多道加工", productionStartDate: "07/06",
      items: [
        { id: uid("item"), name: "氣味展(袖套)", steps: [
          { id: uid("step"), label: "肯定印", done: true, scheduled: null, startDate: "07/06" },
          { id: uid("step"), label: "牧源燙金", done: true, scheduled: null, startDate: "07/07" },
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: "07/09" },
          { id: uid("step"), label: "昌億手工", done: false, scheduled: null, startDate: null },
        ]},
        { id: uid("item"), name: "氣味展(外盒)", steps: [
          { id: uid("step"), label: "牧源燙金", done: true, scheduled: null, startDate: "07/07" },
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: "transfer", startDate: null },
        ]},
        { id: uid("item"), name: "氣味展(底盒)", steps: [
          { id: uid("step"), label: "肯達印", done: true, scheduled: null, startDate: "07/06" },
          { id: uid("step"), label: "牧源燙金", done: false, scheduled: null, startDate: "07/08" },
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: null },
        ]},
        { id: uid("item"), name: "氣味展(內格)", steps: [
          { id: uid("step"), label: "肯達印", done: false, scheduled: null, startDate: "07/08" },
          { id: uid("step"), label: "牧源燙金", done: false, scheduled: null, startDate: null },
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: null },
        ]},
      ],
    }),
    makeOrder(20, "20260706002", "基恩斯", "開窗信封", 1, S.IND_PRODUCTION, {
      plateType: "independent", plateMode: "new", paper: "牛皮紙", postProcessing: "糊信封", productionStartDate: "07/05",
      items: [
        { id: uid("item"), name: "開窗信封(黃)", steps: [
          { id: uid("step"), label: "立雄印", done: true, scheduled: null, startDate: "07/05" },
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: "07/07" },
          { id: uid("step"), label: "順家糊信封", done: false, scheduled: null, startDate: null },
        ]},
        { id: uid("item"), name: "開窗信封(白)", steps: [
          { id: uid("step"), label: "佑晉印", done: false, scheduled: null, startDate: "07/05" },
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: null },
          { id: uid("step"), label: "順家糊信封", done: false, scheduled: null, startDate: null },
        ]},
      ],
    }),
    makeOrder(21, "20260706003", "璻莉緹", "福湯聯名彩盒", 1, S.IND_PRODUCTION, {
      plateType: "independent", plateMode: "new", paper: "250gsm 美術紙", postProcessing: "燙金＋軋型", productionStartDate: "07/04",
      items: [
        { id: uid("item"), name: "福湯聯名彩盒外盒", steps: [
          { id: uid("step"), label: "緯麗印", done: true, scheduled: null, startDate: "07/04" },
          { id: uid("step"), label: "牧源燙金", done: false, scheduled: null, startDate: "07/06" },
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: null },
        ]},
        { id: uid("item"), name: "福湯聯名彩盒內格", steps: [
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: "07/04" },
        ]},
      ],
    }),
    makeOrder(22, "20260706004", "星裕國際", "摩曼頓小信封", 1, S.IND_NEW_PLATEOUT, {
      plateType: "independent", plateMode: "new", paper: "牛皮紙", postProcessing: "糊信封",
      items: [
        { id: uid("item"), name: "摩曼頓小信封", steps: [
          { id: uid("step"), label: "立雄印", done: false, scheduled: null, startDate: null },
          { id: uid("step"), label: "順家糊信封", done: false, scheduled: null, startDate: null },
        ]},
      ],
    }),
    makeOrder(23, "20260706005", "加利利", "護照套", 1, S.IND_PRODUCTION, {
      plateType: "independent", plateMode: "new", paper: "300gsm 灰底卡", postProcessing: "多道加工", productionStartDate: "07/03",
      items: [
        { id: uid("item"), name: "護照套", steps: [
          { id: uid("step"), label: "立雄印", done: true, scheduled: null, startDate: "07/03" },
          { id: uid("step"), label: "牧源燙金", done: false, scheduled: null, startDate: "07/05" },
          { id: uid("step"), label: "昶富軋型", done: false, scheduled: null, startDate: null },
          { id: uid("step"), label: "昌億手工", done: false, scheduled: null, startDate: null },
        ]},
      ],
    }),
  ];
}

function initialTasks() {
  return [
    { id: "task-1", type: "delivery", label: "出貨配送：泰美旅行社 - 旅遊手冊", orderNo: "CR-2026-0115", customer: "泰美旅行社", sequence: 1, managerNote: "客戶指定上午送達", status: "done" },
    { id: "task-2", type: "sample_pickup", label: "至誠品書店合作社 取樣確認封面顏色", orderNo: "CR-2026-0108", sequence: 2, managerNote: "", status: "pending" },
    { id: "task-3", type: "invoice", label: "送發票至藍海科技", orderNo: "CR-2026-0105", sequence: 3, managerNote: "", status: "pending" },
    { id: "task-4", type: "transfer", orderNo: "20260706001", orderId: 19, itemId: null, nextStepId: null, customer: "雨晴", itemName: "氣味展(外盒)", qty: 1, pickupFrom: "牧源燙金", deliverTo: "昶富軋型", sequence: 4, managerNote: "", status: "pending" },
    { id: "task-5", type: "delivery", label: "出貨配送：小可甜點 - 貼標 圓形", orderNo: "CR-2026-0118", customer: "小可甜點", sequence: 5, managerNote: "", status: "pending" },
  ];
}

function initialStaff() {
  // 點2：不再內建示範人員（林設計／陳外務等），只留一個待綁定的主管帳號，
  // 供全新安裝時第一次登入的「先有雞先有蛋」問題使用（綁定方式見權限管理說明）。
  return [
    { id: "staff-1", name: "主管帳號（請改名並綁定 Email）", email: "", role: ROLE.MANAGER, permissions: clonePermissions(DEFAULT_ROLE_PERMISSIONS[ROLE.MANAGER]) },
  ];
}

/* ============================================================
   三、共用小元件
   ============================================================ */

function RegistrationMark({ size = "sm" }) {
  const dim = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <div className="flex gap-0.5 items-center">
      <span className={`${dim} rounded-full bg-cyan-500`} />
      <span className={`${dim} rounded-full bg-fuchsia-500`} />
      <span className={`${dim} rounded-full bg-amber-400`} />
      <span className={`${dim} rounded-full bg-slate-900`} />
    </div>
  );
}

function StatusChip({ order }) {
  const meta = STATUS_META[order.status];
  const v = stageVisual(order);
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs font-medium ${v.chip}`}>
      {meta.label}
    </span>
  );
}

function LockNote({ moduleLabel }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400">
      <Lock size={12} />
      <span>權限不足（需要「{moduleLabel}」權限）</span>
    </div>
  );
}

/* ============================================================
   四、訂單卡片 / 看板欄位
   ============================================================ */

function OrderCard({ order, onOpen }) {
  const meta = STATUS_META[order.status];
  const v = stageVisual(order);
  const isEarlyStage = meta.stage <= 2;
  const highlightShipped = order.status === S.SHIPPING_OUT && order.routeArranged;

  const cardBase = `w-56 shrink-0 text-left border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow border-l-4 relative ${v.borderClass} ${
    highlightShipped ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"
  }`;

  // 點5：階段一、二 僅顯示 訂單編號／客戶名／品名／數量
  if (isEarlyStage) {
    return (
      <button onClick={() => onOpen(order.id)} className={cardBase}>
        <div className={`h-1 w-8 rounded-full mb-2 ${v.bar}`} />
        <div className="font-mono text-[11px] text-slate-400">{order.orderNo}</div>
        <div className="font-semibold text-slate-800 text-sm mt-0.5 truncate">{order.customer}</div>
        <div className="text-slate-500 text-xs mt-1 truncate">{order.product} × {order.qty}</div>
        {order.status === S.PRODUCIBLE && !order.routine && order.quotePrice && (
          <div className="text-sm font-bold text-orange-600 mt-1.5 truncate" title={order.quotePrice}>{order.quotePrice}</div>
        )}
        {order.status === S.QUOTE_PENDING && !order.routine && order.quotePrice && (
          <div className="text-sm font-bold text-red-600 mt-1.5 truncate" title={order.quotePrice}>先前報價：{order.quotePrice}</div>
        )}
      </button>
    );
  }

  // 點6：階段三、四 維持完整資訊，並於右上角顯示首次進入製作中的日期
  return (
    <button onClick={() => onOpen(order.id)} className={cardBase}>
      {order.productionStartDate && (
        <div className="absolute top-2 right-2 text-[9px] bg-slate-800 text-white rounded px-1.5 py-0.5">{order.productionStartDate}</div>
      )}
      <div className="flex items-center justify-between mb-2 pr-14">
        <div className={`h-1 w-8 rounded-full ${v.bar}`} />
        {order.routine && <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">常規免報價</span>}
      </div>
      <div className="font-mono text-[11px] text-slate-400">{order.orderNo}</div>
      <div className="font-semibold text-slate-800 text-sm mt-0.5 truncate">{order.customer}</div>
      <div className="text-slate-500 text-xs mt-1 truncate">{order.product} × {order.qty}</div>
      {order.items && order.items.length > 0 && (
        <div className="text-[10px] text-slate-400 mt-1">{order.items.length} 項物件</div>
      )}
      {order.reworkFlag && (
        <div className="text-[10px] text-red-600 font-semibold mt-1">退回補件中・{order.reworkAt}</div>
      )}
      {order.status === S.IND_PRODUCTION && order.items && order.items.length > 0 && (
        <div className="text-[10px] text-emerald-700 mt-1 truncate">
          目前進度：{[...new Set(order.items.map((it) => getItemCurrentStation(it).label))].join("、")}
        </div>
      )}
      {highlightShipped && (
        <div className="text-[10px] text-blue-700 font-semibold mt-1 bg-blue-100 border border-blue-300 rounded px-1.5 py-0.5">
          已安排出貨
        </div>
      )}
      {order.status === S.DELIVERY_ROUTE && order.completedAt && (
        <div className="text-[10px] text-emerald-700 font-semibold mt-1">完成時間：{order.completedAt}</div>
      )}
    </button>
  );
}

function StatusColumn({ status, orders, onOpen }) {
  const meta = STATUS_META[status];
  const list = sortByRecent(orders.filter((o) => o.status === status));
  const isRed = status === S.QC_FAIL;
  return (
    <div className="w-60 shrink-0">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className={`text-xs font-semibold ${isRed ? "text-red-600" : "text-slate-600"}`}>{meta.label}</span>
        <span className="text-[11px] text-slate-400 bg-slate-100 rounded-full px-1.5">{list.length}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[40px]">
        {list.map((o) => <OrderCard key={o.id} order={o} onOpen={onOpen} />)}
        {list.length === 0 && (
          <div className="text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg p-3 text-center">無訂單</div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   五、儀表板（看板）
   ============================================================ */

function Dashboard({ orders, role, onOpen, query }) {
  const filtered = orders.filter((o) => {
    if (!query) return true;
    const q = query.trim().toLowerCase();
    return o.orderNo.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.product.toLowerCase().includes(q);
  });

  const visibleStatuses = role === ROLE.DELIVERY ? DELIVERY_DASHBOARD_STATUSES : Object.keys(STATUS_META);

  return (
    <div className="space-y-8">
      {role === ROLE.DELIVERY && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
          <Lock size={14} />
          目前僅顯示外務／送貨員可操作的流程節點
        </div>
      )}
      {STAGES.map((stage) => {
        const statusesInStage = visibleStatuses.filter((s) => STATUS_META[s].stage === stage.no);
        if (statusesInStage.length === 0) return null;
        return (
          <div key={stage.no}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`h-2.5 w-2.5 rounded-full ${stage.bar}`} />
              <h3 className={`text-sm font-bold ${stage.text}`}>{stage.label}</h3>
              {(stage.no === 2 || stage.no === 3) && (
                <span className="text-[11px] text-slate-400 flex items-center gap-2 ml-1">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />獨立版</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />合版</span>
                </span>
              )}
              {stage.no === 4 && (
                <span className="text-[11px] text-red-500 flex items-center gap-1 ml-1">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />品管未通過（紅字警示）
                </span>
              )}
              <div className={`h-px flex-1 ${stage.bar} opacity-20`} />
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {statusesInStage.map((s) => (
                <StatusColumn key={s} status={s} orders={filtered} onOpen={onOpen} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   六、單一模組列表視圖
   ============================================================ */

function ModuleListView({ moduleKey, orders, onOpen }) {
  const meta = MODULE_META.find((m) => m.key === moduleKey);
  const statuses = MODULE_STATUS_MAP[moduleKey] || [];
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <meta.icon size={18} className="text-slate-500" /> {meta.label}
      </h2>
      <div className="space-y-6">
        {statuses.map((s) => {
          const list = sortByRecent(orders.filter((o) => o.status === s));
          return (
            <div key={s}>
              <div className="flex items-center gap-2 mb-2">
                <StatusChip order={{ status: s }} />
                <span className="text-xs text-slate-400">{list.length} 筆</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {list.map((o) => <OrderCard key={o.id} order={o} onOpen={onOpen} />)}
                {list.length === 0 && <div className="text-xs text-slate-300">目前無訂單</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   七、獨立版製作進度表
   ============================================================ */

function StepCell({ stepNo, step, canAct, canDelete, onLabelChange, onToggleDone, onDateChange, onSchedule, onDelete }) {
  return (
    <div className="border border-slate-200 rounded-md p-2 w-36 shrink-0 bg-slate-50/60 relative">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-slate-400">加工{stepNo}</div>
        {canDelete && (
          <button onClick={onDelete} className="text-slate-300 hover:text-red-500" title="刪除此加工站">
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {canAct ? (
        <input
          value={step.label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="加工站名稱"
          className="text-xs w-full mb-1 border-b border-dashed border-slate-300 focus:outline-none focus:border-emerald-400 bg-transparent"
        />
      ) : (
        <div className="text-xs font-medium text-slate-700 mb-1">{step.label || "—"}</div>
      )}
      {canAct ? (
        <input
          value={step.startDate || ""}
          onChange={(e) => onDateChange(e.target.value)}
          placeholder="送達日期(如 07/10)"
          className="text-[10px] w-full mb-1.5 border-b border-dashed border-slate-200 focus:outline-none focus:border-emerald-400 bg-transparent text-slate-500"
        />
      ) : (
        step.startDate && <div className="text-[10px] text-slate-400 mb-1.5">{step.startDate} 送達</div>
      )}
      <div className="flex items-center gap-1">
        <input type="checkbox" checked={step.done} onChange={onToggleDone} disabled={!canAct} className="h-3 w-3" />
        <span className="text-[10px] text-slate-400">完成</span>
        {canAct && (
          <>
            <button title="加工站取件" onClick={() => onSchedule("pickup")} className="ml-auto text-slate-300 hover:text-emerald-600">
              <Truck size={12} />
            </button>
            <button title="送至下一站" onClick={() => onSchedule("transfer")} className="text-slate-300 hover:text-cyan-600">
              <Send size={12} />
            </button>
          </>
        )}
      </div>
      {step.scheduled && (
        <div className="text-[10px] text-emerald-600 mt-1">已排入路線・{TASK_TYPE_LABELS[step.scheduled]}</div>
      )}
    </div>
  );
}

function PlateProgressBoard({ orders, permissions, onAddItem, onAddStep, onLabelChange, onToggleDone, onDateChange, onSchedule, onDeleteItem, onDeleteStep, onConfirmComplete }) {
  const canAct = hasPerm(permissions, MODULE.PLATE_PROGRESS, "act");
  const canDelete = hasPerm(permissions, MODULE.PLATE_PROGRESS, "del");
  const list = sortByProductionDate(orders.filter((o) => o.plateType === "independent" && o.status !== S.DELIVERY_ROUTE));
  const [newItemName, setNewItemName] = useState({});

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <History size={18} className="text-slate-500" /> 獨立版製作進度表
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        同一訂單編號可包含多個物件，每個物件可自由新增加工站順序與送達日期。物件在「獨立版・新版(可出版)」或「獨立版・舊版沿用」階段時，
        請於下方新增物件與加工站，設定完成後按下「填寫完成」才會正式推移至「獨立版製作中」。
      </p>
      <div className="space-y-5">
        {list.map((o) => {
          const pendingConfirm = PLATE_SETUP_STATUSES.includes(o.status);
          const ready = isPlateProgressReady(o);
          return (
            <div key={o.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-mono text-xs text-slate-400">{o.orderNo}</div>
                  <div className="font-semibold text-slate-800">{o.customer}</div>
                </div>
                <StatusChip order={o} />
              </div>
              {pendingConfirm && !ready && (
                <div className="mb-3 text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded px-3 py-2">
                  ⚠ 尚未填寫獨立版製作進度表，請先新增物件與加工站
                </div>
              )}
              <div className="space-y-3">
                {(o.items || []).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 flex-wrap border-t border-slate-50 pt-3 first:border-0 first:pt-0">
                    <div className="w-40 shrink-0 flex flex-col gap-1 pt-2">
                      <div className="flex items-start gap-1">
                        <span className="text-sm font-medium text-slate-600">{item.name}</span>
                        {canDelete && (
                          <button onClick={() => onDeleteItem(o.id, item.id)} className="text-slate-300 hover:text-red-500 shrink-0" title="刪除此物件">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <span className={`text-[10px] w-fit rounded px-1.5 py-0.5 border ${getItemCurrentStation(item).done ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        目前：{getItemCurrentStation(item).label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 flex-1">
                      {item.steps.map((step, idx) => (
                        <StepCell
                          key={step.id}
                          stepNo={idx + 1}
                          step={step}
                          canAct={canAct}
                          canDelete={canDelete}
                          onLabelChange={(v) => onLabelChange(o.id, item.id, step.id, v)}
                          onToggleDone={() => onToggleDone(o.id, item.id, step.id)}
                          onDateChange={(v) => onDateChange(o.id, item.id, step.id, v)}
                          onSchedule={(type) => onSchedule(o.id, item.id, step.id, type)}
                          onDelete={() => onDeleteStep(o.id, item.id, step.id)}
                        />
                      ))}
                      {canAct && (
                        <button
                          onClick={() => onAddStep(o.id, item.id)}
                          className="min-h-[80px] w-10 flex items-center justify-center border border-dashed border-slate-200 rounded-md text-slate-300 hover:text-emerald-500 hover:border-emerald-300"
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {canAct && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                    <input
                      placeholder="新增物件名稱，如：外盒 / 內格"
                      value={newItemName[o.id] || ""}
                      onChange={(e) => setNewItemName((v) => ({ ...v, [o.id]: e.target.value }))}
                      className="text-sm border border-slate-200 rounded px-2 py-1 w-56"
                    />
                    <button
                      onClick={() => {
                        if (!(newItemName[o.id] || "").trim()) return;
                        onAddItem(o.id, newItemName[o.id]);
                        setNewItemName((v) => ({ ...v, [o.id]: "" }));
                      }}
                      className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 rounded px-3 py-1"
                    >
                      ＋ 新增物件
                    </button>
                  </div>
                )}
              </div>

              {pendingConfirm && (
                ready ? (
                  canAct ? (
                    <button
                      onClick={() => onConfirmComplete(o.id)}
                      className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg py-2 font-medium"
                    >
                      ✓ 填寫完成，進入獨立版製作中
                    </button>
                  ) : (
                    <LockNote moduleLabel={MODULE_META.find((m) => m.key === MODULE.PLATE_PROGRESS)?.label} />
                  )
                ) : (
                  <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    請先新增至少一項物件並設定加工站，才能標記「填寫完成」
                  </div>
                )
              )}
              {o.status === S.IND_PRODUCTION && (
                <div className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={12} /> 已進入獨立版製作中
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && <div className="text-sm text-slate-300">目前無獨立版訂單</div>}
      </div>
    </div>
  );
}

/* ============================================================
   八、送貨員路線安排
   ============================================================ */

function DeliveryRouteView({ tasks, permissions, onAddTask, onMove, onToggleDone, onUpdateNote, onDeleteTask, onClearAll, onCompleteOrder }) {
  const canAct = hasPerm(permissions, MODULE.DELIVERY_ROUTE, "act");
  const canReorderDelete = hasPerm(permissions, MODULE.DELIVERY_ROUTE, "del");
  const canClear = hasPerm(permissions, MODULE.DELIVERY_ROUTE, "clear");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ type: "sample_pickup", label: "", orderNo: "" });
  const [clearConfirm, setClearConfirm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // 點1：已勾選完成的任務移至「已完成任務」頁面，這裡只顯示待處理的
  const sorted = [...tasks].filter((t) => t.status !== "done").sort((a, b) => a.sequence - b.sequence);

  const submit = () => {
    if (!form.label.trim()) return;
    onAddTask({ type: form.type, label: form.label, orderNo: form.orderNo || null });
    setForm({ type: "sample_pickup", label: "", orderNo: "" });
    setFormOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Route size={18} className="text-slate-500" /> 路線安排
        </h2>
        <div className="flex items-center gap-2">
          {canClear && (
            <button
              onClick={() => {
                if (!clearConfirm) { setClearConfirm(true); return; }
                onClearAll();
                setClearConfirm(false);
              }}
              className={`text-sm rounded-lg px-3 py-1.5 ${clearConfirm ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {clearConfirm ? "再次點擊以確認清空" : "一鍵清空路線安排"}
            </button>
          )}
          {canAct && (
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="flex items-center gap-1 text-sm bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-900"
            >
              <Plus size={14} /> 新增任務
            </button>
          )}
        </div>
      </div>

      {formOpen && canAct && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 space-y-2">
          <div className="text-xs text-slate-400 mb-1">可新增客戶取樣、客戶送樣、取件、送件等隨機任務，加入後排在清單最末，再用上下箭頭調整順序即可。</div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm"
            >
              {MANUAL_TASK_TYPES.map((k) => <option key={k} value={k}>{TASK_TYPE_LABELS[k]}</option>)}
            </select>
            <input
              placeholder="相關訂單編號（選填）"
              value={form.orderNo}
              onChange={(e) => setForm((f) => ({ ...f, orderNo: e.target.value }))}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <input
            placeholder="任務內容說明"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
          />
          <button onClick={submit} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm rounded px-3 py-1.5">
            加入任務清單
          </button>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((t, i) => (
          <div key={t.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3">
            {canReorderDelete && (
              <div className="flex flex-col">
                <button onClick={() => onMove(t.id, "up")} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => onMove(t.id, "down")} disabled={i === sorted.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30">
                  <ChevronDown size={14} />
                </button>
              </div>
            )}
            <div className="font-mono text-xs text-slate-400 w-6">{i + 1}</div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${TASK_TYPE_BADGE[t.type]}`}>{TASK_TYPE_LABELS[t.type]}</span>
            <div className="flex-1 min-w-0">
              {STRUCTURED_TASK_TYPES.includes(t.type) ? (
                <div>
                  <div className="text-xs text-slate-500">{t.customer}</div>
                  <div className="text-sm font-medium text-slate-700">{t.itemName}　<span className="text-xs text-slate-400 font-normal">數量 {t.qty}</span></div>
                  <div className="text-xs text-slate-500 mt-0.5">取件處：{t.pickupFrom}　→　交件處：{t.deliverTo}</div>
                </div>
              ) : (
                <div className="text-sm text-slate-700">{t.label}</div>
              )}
              {t.orderNo && <div className="text-[11px] text-slate-400 font-mono mt-0.5">{t.orderNo}</div>}
              <div className="mt-1">
                {canAct ? (
                  <input
                    placeholder="主管備註"
                    value={t.managerNote}
                    onChange={(e) => onUpdateNote(t.id, e.target.value)}
                    className="text-xs border-b border-dashed border-slate-200 focus:outline-none focus:border-fuchsia-400 w-full bg-transparent"
                  />
                ) : t.managerNote ? (
                  <div className="text-xs text-slate-400">備註：{t.managerNote}</div>
                ) : null}
              </div>
            </div>

            {/* 點7：出貨配送任務改為「完成訂單」按鈕，按下後才真正離開已開單待出貨 */}
            {t.type === "delivery" ? (
              canAct ? (
                <button onClick={() => onCompleteOrder(t.id)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-3 py-1.5 shrink-0">
                  完成訂單
                </button>
              ) : (
                <LockNote moduleLabel="路線安排" />
              )
            ) : (
              <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                <input type="checkbox" checked={t.status === "done"} onChange={() => onToggleDone(t.id)} disabled={!canAct} />
                已完成
              </label>
            )}

            {canReorderDelete && (
              <button
                onClick={() => {
                  if (confirmDeleteId === t.id) { onDeleteTask(t.id); setConfirmDeleteId(null); }
                  else setConfirmDeleteId(t.id);
                }}
                className={`p-1 shrink-0 ${confirmDeleteId === t.id ? "text-red-600" : "text-slate-300 hover:text-red-500"}`}
                title={confirmDeleteId === t.id ? "再次點擊以確認刪除（相關訂單將退回已開單待出貨）" : "刪除此路線任務"}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {sorted.length === 0 && <div className="text-sm text-slate-300">目前尚無任務</div>}
      </div>
    </div>
  );
}

/* ============================================================
   八之二、已完成訂單（點6：階段六，支援一鍵清空）
   ============================================================ */

function CompletedOrdersView({ orders, onOpen, onClearAll, canClear }) {
  const [confirm, setConfirm] = useState(false);
  const list = sortByRecent(orders.filter((o) => o.status === S.DELIVERY_ROUTE));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-slate-500" /> 已完成訂單
        </h2>
        {canClear && (
          <button
            onClick={() => {
              if (!confirm) { setConfirm(true); return; }
              onClearAll();
              setConfirm(false);
            }}
            className={`text-sm rounded-lg px-3 py-1.5 ${confirm ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {confirm ? "再次點擊以確認清空" : "一鍵清空已完成訂單"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {list.map((o) => <OrderCard key={o.id} order={o} onOpen={onOpen} />)}
        {list.length === 0 && <div className="text-sm text-slate-300">目前無已完成訂單</div>}
      </div>
    </div>
  );
}

/* ============================================================
   八之三、已完成任務（點1：路線安排中勾選完成的任務會移到這裡）
   ============================================================ */

function CompletedTasksView({ tasks, permissions, onToggleDone, onClearAll }) {
  const canAct = hasPerm(permissions, MODULE.COMPLETED_TASKS, "act");
  const canClear = hasPerm(permissions, MODULE.COMPLETED_TASKS, "clear");
  const [confirm, setConfirm] = useState(false);
  // 點3：訂單完成（delivery 類型）歸類到「已完成訂單」，這裡只顯示其餘任務
  const list = [...tasks].filter((t) => t.status === "done" && t.type !== "delivery").sort((a, b) => a.sequence - b.sequence);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <ClipboardList size={18} className="text-slate-500" /> 已完成任務
        </h2>
        {canClear && (
          <button
            onClick={() => {
              if (!confirm) { setConfirm(true); return; }
              onClearAll();
              setConfirm(false);
            }}
            className={`text-sm rounded-lg px-3 py-1.5 ${confirm ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {confirm ? "再次點擊以確認清空" : "一鍵清空已完成任務"}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {list.map((t) => (
          <div key={t.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3 opacity-70">
            <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${TASK_TYPE_BADGE[t.type]}`}>{TASK_TYPE_LABELS[t.type]}</span>
            <div className="flex-1 min-w-0">
              {STRUCTURED_TASK_TYPES.includes(t.type) ? (
                <div className="line-through">
                  <div className="text-xs text-slate-500">{t.customer}</div>
                  <div className="text-sm font-medium text-slate-700">{t.itemName}　<span className="text-xs text-slate-400 font-normal">數量 {t.qty}</span></div>
                </div>
              ) : (
                <div className="text-sm text-slate-700 line-through">{t.label}</div>
              )}
              {t.orderNo && <div className="text-[11px] text-slate-400 font-mono mt-0.5">{t.orderNo}</div>}
              {t.managerNote && <div className="text-xs text-slate-400 mt-0.5">備註：{t.managerNote}</div>}
              {t.completedAt && <div className="text-[11px] text-emerald-700 mt-0.5">完成時間：{t.completedAt}</div>}
            </div>
            {canAct && (
              <button onClick={() => onToggleDone(t.id)} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">
                取消完成
              </button>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="text-sm text-slate-300">目前無已完成任務</div>}
      </div>
    </div>
  );
}

/* ============================================================
   九、訂單詳情 Modal
   ============================================================ */

function QuoteRowsForm({ onSubmit }) {
  const [rows, setRows] = useState([{ qty: "", unitPrice: "", total: "" }]);

  const updateRow = (idx, patch) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        if (next.qty && next.unitPrice) {
          const q = Number(next.qty);
          const u = Number(next.unitPrice);
          if (!isNaN(q) && !isNaN(u)) next.total = String(q * u);
        }
        return next;
      })
    );
  };

  const addRow = () => setRows((prev) => [...prev, { qty: "", unitPrice: "", total: "" }]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const validRows = rows.filter((r) => r.qty && r.total);
  const canSubmit = validRows.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const summary = validRows.map((r) => `${r.qty}個 NT$${Number(r.total).toLocaleString()}`).join("、");
    onSubmit(summary, validRows);
  };

  return (
    <div className="p-3 bg-slate-50 space-y-2">
      <div className="text-xs text-slate-500 mb-1">可新增單一品項的多種數量報價，若有填單價會自動算出總價（也可以直接手動填總價）</div>
      {rows.map((r, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <input
            placeholder="數量"
            value={r.qty}
            onChange={(e) => updateRow(idx, { qty: e.target.value })}
            className="w-20 text-sm border border-slate-200 rounded px-2 py-1.5"
          />
          <input
            placeholder="單價（選填）"
            value={r.unitPrice}
            onChange={(e) => updateRow(idx, { unitPrice: e.target.value })}
            className="w-24 text-sm border border-slate-200 rounded px-2 py-1.5"
          />
          <span className="text-xs text-slate-400 shrink-0">→</span>
          <input
            placeholder="總價 *"
            value={r.total}
            onChange={(e) => updateRow(idx, { total: e.target.value })}
            className="flex-1 min-w-0 text-sm border border-slate-200 rounded px-2 py-1.5"
          />
          {rows.length > 1 && (
            <button onClick={() => removeRow(idx)} className="text-slate-300 hover:text-red-500 shrink-0">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <button onClick={addRow} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded px-3 py-1.5">
        ＋ 新增數量選項
      </button>
      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm rounded py-1.5 mt-1"
      >
        確認送出
      </button>
      {!canSubmit && <div className="text-[11px] text-red-500">請至少填寫一組數量與總價</div>}
    </div>
  );
}

function ActionRow({ order, action, permissions, onTransition, onNavigateModule }) {
  const currentModule = STATUS_META[order.status].module;
  const requiredModule = action.overrideModule || currentModule;
  const allowed = hasPerm(permissions, requiredModule, "act");
  const moduleLabel = MODULE_META.find((m) => m.key === requiredModule)?.label || requiredModule;
  const [fieldValues, setFieldValues] = useState({});
  const [open, setOpen] = useState(false);

  const variantClass = {
    primary: "bg-fuchsia-600 hover:bg-fuchsia-700 text-white",
    warn: "bg-amber-100 hover:bg-amber-200 text-amber-800",
    danger: "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200",
  }[action.variant || "primary"];

  if (!allowed) {
    return (
      <div className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2 bg-slate-50">
        <span className="text-sm text-slate-400">{action.label}</span>
        <LockNote moduleLabel={moduleLabel} />
      </div>
    );
  }

  if (action.requiresPlateSetup) {
    const plateReady = order.items && order.items.length > 0 && order.items.every((it) => it.steps && it.steps.length > 0);
    if (!plateReady) {
      return (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle size={14} />
            <span>{action.label}（需先完成獨立版製作進度表設定）</span>
          </div>
          <button
            onClick={() => onNavigateModule(MODULE.PLATE_PROGRESS)}
            className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded px-3 py-1.5"
          >
            前往獨立版製作進度表設定
          </button>
        </div>
      );
    }
  }

  // 防呆：獨立版所有加工站需全部勾選完成，才可進入到貨
  if (action.requiresAllStepsDone && !isProductionFullyDone(order)) {
    const unfinished = getUnfinishedItemNames(order);
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle size={14} />
          <span>{action.label}（尚有加工站未完成）</span>
        </div>
        {unfinished.length > 0 && (
          <div className="text-xs text-amber-700">未完成物件：{unfinished.join("、")}</div>
        )}
        <button
          onClick={() => onNavigateModule(MODULE.PLATE_PROGRESS)}
          className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded px-3 py-1.5"
        >
          前往獨立版製作進度表確認
        </button>
      </div>
    );
  }

  const missingRequired = (action.fields || []).some((f) => f.required && !(fieldValues[f.key] || "").toString().trim());

  const submit = () => {
    if (missingRequired) return;
    onTransition(order.id, action, fieldValues);
    setOpen(false);
    setFieldValues({});
  };

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => ((action.fields || action.isQuoteForm) ? setOpen((v) => !v) : onTransition(order.id, action, {}))}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium ${variantClass}`}
      >
        <span className="flex items-center gap-1.5">{action.label}</span>
        <ArrowRight size={14} />
      </button>
      {action.dynamicTarget && (
        <div className="px-3 py-1.5 text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
          將依原製作路徑退回：{order.plateType === "combined" ? "合版製作中" : "獨立版製作中"}
        </div>
      )}
      {open && action.isQuoteForm && (
        <QuoteRowsForm
          onSubmit={(summary, quoteOptions) => {
            onTransition(order.id, action, { quotePrice: summary, quoteOptions });
            setOpen(false);
          }}
        />
      )}
      {open && action.fields && (
        <div className="p-3 bg-slate-50 space-y-2">
          {action.fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-slate-500 block mb-1">
                {f.label}{f.required && <span className="text-red-500"> *必填</span>}
              </label>
              <input
                type="text"
                className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-fuchsia-300"
                value={fieldValues[f.key] || ""}
                onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <button
            onClick={submit}
            disabled={missingRequired}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm rounded py-1.5 mt-1"
          >
            確認送出
          </button>
          {missingRequired && <div className="text-[11px] text-red-500">請先填寫必填欄位才可進行下一步</div>}
        </div>
      )}
    </div>
  );
}

function RevertRow({ order, permissions, onRevert }) {
  const lastEntry = order.history[order.history.length - 1];
  if (!lastEntry || lastEntry.from === null) return null;
  const currentModule = STATUS_META[order.status].module;
  const allowed = hasPerm(permissions, currentModule, "act");
  const prevLabel = STATUS_META[lastEntry.from]?.label || lastEntry.from;
  if (!allowed) {
    return (
      <div className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2 bg-slate-50 mt-2">
        <span className="text-sm text-slate-400">回到上一步：{prevLabel}</span>
        <LockNote moduleLabel={MODULE_META.find((m) => m.key === currentModule)?.label} />
      </div>
    );
  }
  return (
    <button
      onClick={() => onRevert(order.id, lastEntry.from)}
      className="w-full flex items-center justify-center gap-1.5 mt-2 border border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 rounded-lg px-3 py-2 text-sm"
    >
      <Undo2 size={14} /> 回到上一步：{prevLabel}
    </button>
  );
}

function OrderModal({ order, permissions, onClose, onTransition, onNavigateModule, onEditOrder, onDeleteOrder, onRevertOrder }) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(order ? { customer: order.customer, product: order.product, qty: order.qty } : {});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); // 點1：預設收合
  const [expandedItems, setExpandedItems] = useState(new Set()); // 點2：點擊展開才顯示各站日期

  const toggleItemExpand = (itemId) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  if (!order) return null;
  const actions = TRANSITIONS[order.status] || [];
  const currentModule = STATUS_META[order.status].module;
  const canAct = hasPerm(permissions, currentModule, "act");
  const canDelete = hasPerm(permissions, currentModule, "del");

  const saveEdit = () => {
    onEditOrder(order.id, editForm);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-start sm:items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-lg shadow-xl my-8" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 border-b border-slate-100 flex items-start justify-between sticky top-0 bg-white rounded-t-xl z-10">
          <div className="flex-1">
            <div className="font-mono text-xs text-slate-400">{order.orderNo}</div>
            {editing ? (
              <div className="space-y-1.5 mt-1">
                <input value={editForm.customer} onChange={(e) => setEditForm((f) => ({ ...f, customer: e.target.value }))} className="w-full text-sm border border-slate-200 rounded px-2 py-1" placeholder="客戶名稱" />
                <input value={editForm.product} onChange={(e) => setEditForm((f) => ({ ...f, product: e.target.value }))} className="w-full text-sm border border-slate-200 rounded px-2 py-1" placeholder="品名" />
                <input value={editForm.qty} onChange={(e) => setEditForm((f) => ({ ...f, qty: e.target.value }))} className="w-full text-sm border border-slate-200 rounded px-2 py-1" placeholder="數量" />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="text-xs bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded px-2 py-1">儲存</button>
                  <button onClick={() => setEditing(false)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded px-2 py-1">取消</button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-800">{order.customer}</h3>
                <div className="text-sm text-slate-500 mt-0.5">{order.product} × {order.qty}</div>
                {(order.paper || order.postProcessing) && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {order.paper && <>紙張：{order.paper}</>}{order.paper && order.postProcessing && "　"}{order.postProcessing && <>後加工需求：{order.postProcessing}</>}
                  </div>
                )}
                {order.status === S.ARRIVAL && !order.routine && order.quotePrice && (
                  <div className="text-sm font-bold text-orange-600 mt-1">報價金額（可製作階段）：{order.quotePrice}</div>
                )}
                {order.status === S.QUOTE_PENDING && !order.routine && order.quotePrice && (
                  <div className="text-sm font-bold text-red-600 mt-1">先前報價：{order.quotePrice}（需重新報價）</div>
                )}
                {!order.routine && order.quoteOptions && order.quoteOptions.length > 1 && (
                  <div className="mt-1.5 text-xs bg-slate-50 rounded-lg p-2 space-y-0.5">
                    {order.quoteOptions.map((r, i) => (
                      <div key={i} className="flex justify-between text-slate-500">
                        <span>{r.qty} 個{r.unitPrice ? `（單價 NT$${r.unitPrice}）` : ""}</span>
                        <span className="font-medium text-slate-700">NT$ {Number(r.total).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatusChip order={order} />
              {order.reworkFlag && <span className="text-xs text-red-600 font-semibold">退回補件中・{order.reworkAt}</span>}
              {order.status === S.SHIPPING_OUT && order.routeArranged && <span className="text-xs text-blue-700 font-semibold bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">已安排出貨</span>}
              {order.status === S.DELIVERY_ROUTE && order.completedAt && <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">完成時間：{order.completedAt}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {canAct && !editing && (
              <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700 p-1" title="編輯訂單資訊">
                <Pencil size={16} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  if (!confirmDelete) { setConfirmDelete(true); return; }
                  onDeleteOrder(order.id);
                }}
                className={`p-1 ${confirmDelete ? "text-red-600" : "text-slate-400 hover:text-red-500"}`}
                title={confirmDelete ? "再次點擊以確認刪除" : "刪除訂單"}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
          </div>
        </div>
        {confirmDelete && (
          <div className="bg-red-50 text-red-700 text-xs px-5 py-2 border-b border-red-100 shrink-0">
            再次點擊垃圾桶圖示以確認刪除此訂單，此動作無法復原。
          </div>
        )}

        <div className="p-5 space-y-5">
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">可執行動作</h4>
            {actions.length === 0 ? (
              PLATE_SETUP_STATUSES.includes(order.status) ? (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    請至「獨立版製作進度表」新增物件與加工站，並按下「填寫完成」按鈕以進入獨立版製作中。
                    <button onClick={() => onNavigateModule(MODULE.PLATE_PROGRESS)} className="block mt-1 text-xs underline text-amber-800">
                      前往獨立版製作進度表
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <CheckCircle2 size={16} /> 此訂單流程已全部完成
                </div>
              )
            ) : (
              <div className="space-y-2">
                {actions.map((a, i) => (
                  <ActionRow key={i} order={order} action={a} permissions={permissions} onTransition={onTransition} onNavigateModule={onNavigateModule} />
                ))}
              </div>
            )}
            <RevertRow order={order} permissions={permissions} onRevert={onRevertOrder} />
          </div>

          {order.plateType === "independent" && order.items && order.items.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">目前製作進度</h4>
              <div className="space-y-1.5">
                {order.items.map((item) => {
                  const info = getItemCurrentStation(item);
                  const isOpen = expandedItems.has(item.id);
                  return (
                    <div key={item.id} className="bg-slate-50 rounded-lg px-3 py-2">
                      <button onClick={() => toggleItemExpand(item.id)} className="w-full flex items-center justify-between text-sm">
                        <span className="text-slate-600 flex items-center gap-1">
                          {isOpen ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                          {item.name}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${info.done ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                          {info.label}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                          {item.steps.map((s, idx) => (
                            <div key={s.id} className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">加工{idx + 1}：{s.label || "(未命名)"}</span>
                              <span className={s.done ? "text-emerald-600" : "text-slate-400"}>
                                {s.done ? "已完成" : s.startDate ? `${s.startDate} 送達` : "尚未送達"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(order.meta).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">已登記資料</h4>
              <div className="text-sm bg-slate-50 rounded-lg p-3 space-y-1">
                {Object.entries(order.meta).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-slate-600">
                    <span className="text-slate-400">{k}</span><span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 點1：狀態歷程預設收合，點按展開 */}
          <div>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2"
            >
              <span className="flex items-center gap-1"><History size={12} /> 狀態歷程（{order.history.length}）</span>
              {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {historyOpen && (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {order.history.slice().reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-700">{h.note}</span>
                      {" "}→ {STATUS_META[h.to]?.label}
                      <div className="text-slate-400">{h.by} ・ {h.at}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ============================================================
   十、新增訂單 Modal
   ============================================================ */

function AddOrderModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState({ customer: "", product: "", qty: "", note: "", paper: "", postProcessing: "" });
  if (!open) return null;
  // 點4：紙張、後加工 為必填
  const canSubmit = form.customer.trim() && form.product.trim() && form.paper.trim() && form.postProcessing.trim();
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(form);
    setForm({ customer: "", product: "", qty: "", note: "", paper: "", postProcessing: "" });
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-start sm:items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-md shadow-xl my-8" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-xl z-10">
            <h3 className="text-lg font-bold text-slate-800">新增訂單</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">客戶名稱 *</label>
              <input value={form.customer} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">品名 *</label>
              <input value={form.product} onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">數量</label>
              <input value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">紙張 *</label>
              <input value={form.paper} onChange={(e) => setForm((f) => ({ ...f, paper: e.target.value }))} placeholder="例：157gsm 銅版紙" className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">後加工需求 *</label>
              <input value={form.postProcessing} onChange={(e) => setForm((f) => ({ ...f, postProcessing: e.target.value }))} placeholder="例：燙金、軋型、無" className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">備註</label>
              <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm rounded py-2 mt-2"
            >
              建立訂單（進入待報價）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   十一、常規（免報價）品項快速建檔 Modal
   ============================================================ */

function QuickRoutineOrderModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState({ customer: "", product: ROUTINE_PRODUCTS[0], customProduct: "", itemName: "", spec: "", qty: "", note: "" });
  if (!open) return null;
  const finalProduct = form.product === "其他（自行輸入）" ? form.customProduct : form.product;
  const canSubmit = form.customer.trim() && finalProduct.trim();
  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ customer: form.customer, product: finalProduct, itemName: form.itemName, spec: form.spec, qty: form.qty, note: form.note });
    setForm({ customer: "", product: ROUTINE_PRODUCTS[0], customProduct: "", itemName: "", spec: "", qty: "", note: "" });
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-start sm:items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-md shadow-xl my-8" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-xl z-10">
            <div>
              <h3 className="text-lg font-bold text-slate-800">常規品項快速建檔</h3>
              <p className="text-xs text-slate-400 mt-0.5">免報價，直接進入「已來檔核對中」</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">客戶名稱 *</label>
              <input value={form.customer} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">常規品項（下拉選單） *</label>
              <select
                value={form.product}
                onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
              >
                {ROUTINE_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {form.product === "其他（自行輸入）" && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">請輸入品項名稱 *</label>
                <input value={form.customProduct} onChange={(e) => setForm((f) => ({ ...f, customProduct: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 block mb-1">品名</label>
              <input value={form.itemName} onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" placeholder="選填，例：生日賀卡" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">規格</label>
              <input value={form.spec} onChange={(e) => setForm((f) => ({ ...f, spec: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" placeholder="選填，例：9x5.4cm 雙面全彩" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">數量</label>
              <input value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">備註</label>
              <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" placeholder="選填" />
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm rounded py-2 mt-2"
            >
              直接建檔（跳過報價，進入已來檔核對中）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   十二、權限管理 + Google 試算表匯出設定（點8、點9，僅主管可開啟）
   ============================================================ */

function PermissionsAdminModal({ open, onClose, staffList, onAddStaff, onDeleteStaff, onTogglePermission, onUpdateEmail, onUpdateName, webhookUrl, onWebhookChange, exportLog }) {
  const [newStaff, setNewStaff] = useState({ name: "", email: "", role: ROLE.SALES });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  if (!open) return null;

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const countOn = (perm) => {
    let total = 0;
    MODULE_META.forEach((m) => PERM_FLAGS.forEach((f) => { if (perm[m.key]?.[f]) total += 1; }));
    return total;
  };
  const maxCount = MODULE_META.length * PERM_FLAGS.length;

  return (
    // 點2：改用「背景層本身可捲動」的作法，不依賴 max-h-[90vh] 這類需要 JIT 編譯才會生效的任意數值，
    // 視窗夠矮時自動置中，內容太高時整層背景可上下捲動，標頭則用 sticky 固定在捲動區最上方。
    <div className="fixed inset-0 bg-slate-900/40 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-start sm:items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl my-8" onClick={(e) => e.stopPropagation()}>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-xl z-10">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Settings size={18} /> 權限管理</h3>
              <p className="text-xs text-slate-400 mt-0.5">主管專屬：新增／刪除人員，並逐人設定各區塊的使用權限</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
          </div>

          <div className="p-5 space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1"><Users size={12} /> 新增人員</h4>
              {CLOUD_ENABLED && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
                  這裡只建立「權限設定檔」。真正能登入的帳號密碼，請先到 Supabase 後台「Authentication → Users → Add user」建立，
                  這裡的 Email 要跟那邊填的完全一致，系統才認得出是同一個人。
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                <input
                  placeholder="姓名"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff((f) => ({ ...f, name: e.target.value }))}
                  className="flex-1 min-w-[100px] border border-slate-200 rounded px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="登入 Email（需與 Supabase 帳號一致）"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff((f) => ({ ...f, email: e.target.value }))}
                  className="flex-1 min-w-[160px] border border-slate-200 rounded px-2 py-1.5 text-sm"
                />
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff((f) => ({ ...f, role: e.target.value }))}
                  className="border border-slate-200 rounded px-2 py-1.5 text-sm"
                >
                  {Object.values(ROLE).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <button
                  onClick={() => {
                    if (!newStaff.name.trim()) return;
                    onAddStaff(newStaff.name, newStaff.role, newStaff.email);
                    setNewStaff({ name: "", email: "", role: ROLE.SALES });
                  }}
                  className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm rounded px-3 py-1.5 shrink-0"
                >
                  新增
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {staffList.map((s) => {
                const isOpen = expandedIds.has(s.id);
                return (
                  <div key={s.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleExpand(s.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                        <span className="font-medium text-slate-800 text-sm">{s.name}</span>
                        {s.email && <span className="text-[11px] text-slate-400 font-mono">{s.email}</span>}
                        <span className="text-[11px] text-slate-400">已開啟 {countOn(s.permissions)}/{maxCount} 項權限</span>
                      </div>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirmDeleteId === s.id) { onDeleteStaff(s.id); setConfirmDeleteId(null); }
                          else setConfirmDeleteId(s.id);
                        }}
                        className={`p-1 ${confirmDeleteId === s.id ? "text-red-600" : "text-slate-300 hover:text-red-500"}`}
                        title={confirmDeleteId === s.id ? "再次點擊以確認刪除人員" : "刪除人員"}
                      >
                        <Trash2 size={14} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="p-3 border-t border-slate-100">
                        <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-slate-500 block mb-1">姓名</label>
                            <input
                              value={s.name}
                              onChange={(e) => onUpdateName(s.id, e.target.value)}
                              className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                          {CLOUD_ENABLED && (
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">登入 Email（需與 Supabase 帳號一致）</label>
                              <input
                                value={s.email || ""}
                                onChange={(e) => onUpdateEmail(s.id, e.target.value)}
                                placeholder="you@example.com"
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm font-mono"
                              />
                            </div>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400">
                              <th className="text-left font-normal py-1 pr-2">區塊</th>
                              {PERM_FLAGS.map((f) => (
                                <th key={f} className="text-center font-normal py-1 px-1 whitespace-nowrap">{PERM_FLAG_LABELS[f]}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {MODULE_META.map((m) => (
                              <tr key={m.key} className="border-t border-slate-50">
                                <td className="py-1 pr-2 text-slate-600 whitespace-nowrap">{m.label}</td>
                                {PERM_FLAGS.map((f) => (
                                  <td key={f} className="text-center py-1 px-1">
                                    <input
                                      type="checkbox"
                                      checked={!!s.permissions[m.key]?.[f]}
                                      onChange={() => onTogglePermission(s.id, m.key, f)}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Google 試算表匯出</h4>
              <p className="text-xs text-slate-400 mb-2">
                填入您部署的 Google Apps Script Web App 網址，「完成訂單」時，非常規品項會自動整理成一列資料並嘗試送出。
                由於瀏覽器安全限制，實際送達仍請以您的 Google 試算表為準；下方「匯出紀錄」會列出本次工作階段中已整理好、準備送出的資料，供核對。
              </p>
              <input
                placeholder="https://script.google.com/macros/s/xxxx/exec"
                value={webhookUrl}
                onChange={(e) => onWebhookChange(e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm font-mono"
              />
              {exportLog.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {exportLog.map((row) => (
                    <div key={row.id} className="text-xs bg-slate-50 rounded px-2 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="text-slate-400">{row.日期}</span>
                      <span className="font-mono">{row.訂單編號}</span>
                      <span>{row.客戶名}</span>
                      <span className="font-medium">{row.物件名}</span>
                      <span>×{row.數量}</span>
                      <span className="text-slate-400">{row.紙張}</span>
                      <span className="text-slate-400">{row.後加工}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   十二之二、登入畫面
   ============================================================ */

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message === "Invalid login credentials" ? "帳號或密碼不正確" : signInError.message);
      return;
    }
    onLogin?.();
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 font-body">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
      `}</style>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex gap-0.5">
            <span className="h-3 w-3 rounded-full bg-cyan-500" />
            <span className="h-3 w-3 rounded-full bg-fuchsia-500" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-slate-900" />
          </div>
        </div>
        <h1 className="font-display font-bold text-xl text-slate-800">誠瑞印刷</h1>
        <p className="text-xs text-slate-400 mb-5">訂單與任務管理系統・請先登入</p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">帳號（Email）</label>
            <div className="relative">
              <Mail size={14} className="absolute left-2.5 top-2.5 text-slate-300" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1.5 pl-8 text-sm"
                placeholder="you@example.com"
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1.5">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 text-white text-sm font-medium rounded py-2 mt-1"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            {loading ? "登入中…" : "登入"}
          </button>
        </form>
        <p className="text-[11px] text-slate-300 mt-4 text-center">帳號由管理員建立，如尚未取得帳號密碼請聯繫主管。</p>
      </div>
    </div>
  );
}

/* ============================================================
   十三、主應用程式
   ============================================================ */

export default function App() {
  const [staffList, setStaffList] = useState(initialStaff);
  const [selectedStaffId, setSelectedStaffId] = useState("staff-1");
  const [orders, setOrders] = useState(initialOrders);
  const [deliveryTasks, setDeliveryTasks] = useState(initialTasks);
  const [activeModule, setActiveModule] = useState(MODULE.DASHBOARD);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [query, setQuery] = useState("");
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [showQuickRoutine, setShowQuickRoutine] = useState(false);
  const [showPermissionsAdmin, setShowPermissionsAdmin] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sheetWebhookUrl, setSheetWebhookUrl] = useState("");
  const [exportLog, setExportLog] = useState([]);

  // ---- 雲端登入／跨裝置同步狀態（僅在有設定 Supabase 連線時啟用） ----
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(!CLOUD_ENABLED);
  const [cloudDataLoaded, setCloudDataLoaded] = useState(!CLOUD_ENABLED);
  const [cloudError, setCloudError] = useState("");
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error
  const isRemoteUpdate = useRef(false);

  // 檢查登入狀態、監聽登入/登出事件
  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 登入後：讀取雲端資料 + 訂閱即時同步（其他裝置變更會自動反映）
  useEffect(() => {
    if (!CLOUD_ENABLED || !session) return;
    let channel;
    let cancelled = false;

    const applyRemote = (d) => {
      if (!d) return;
      isRemoteUpdate.current = true;
      if (d.orders) setOrders(d.orders);
      if (d.deliveryTasks) setDeliveryTasks(d.deliveryTasks);
      if (d.staffList) setStaffList(d.staffList);
      if (d.exportLog) setExportLog(d.exportLog);
      if (typeof d.sheetWebhookUrl === "string") setSheetWebhookUrl(d.sheetWebhookUrl);
    };

    (async () => {
      const { data, error } = await supabase.from("app_state").select("data").eq("id", APP_STATE_ROW_ID).maybeSingle();
      if (cancelled) return;
      if (error) {
        // 讀取失敗（常見原因：資料表不存在、RLS 政策設定錯誤、金鑰不對）
        setCloudError(`讀取雲端資料失敗：${error.message}`);
        setCloudDataLoaded(true);
        return;
      }
      if (data?.data) {
        applyRemote(data.data);
      } else {
        // 第一次使用，把目前的示範資料寫進雲端當作初始狀態
        const { error: seedError } = await supabase.from("app_state").upsert(
          { id: APP_STATE_ROW_ID, data: { orders, deliveryTasks, staffList, exportLog, sheetWebhookUrl } },
          { onConflict: "id" }
        );
        if (seedError) {
          setCloudError(`初始化雲端資料失敗：${seedError.message}`);
          setCloudDataLoaded(true);
          return;
        }
      }
      setCloudError("");
      setCloudDataLoaded(true);

      channel = supabase
        .channel("app_state_sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: `id=eq.${APP_STATE_ROW_ID}` }, (payload) => {
          applyRemote(payload.new?.data);
        })
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || err) {
            setCloudError(`即時同步連線失敗：${err?.message || status}`);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [session]);

  // 任何資料變動時（非遠端同步造成的），debounce 後寫回雲端，讓其他裝置也能看到最新狀態，
  // 也是「關閉重開後恢復上次狀態」的同一套機制——重新整理／關閉分頁後，登入時會重新從雲端讀回這筆資料。
  const pendingWriteRef = useRef(null);
  const writeTimeoutRef = useRef(null);

  const doUpsert = async (payload) => {
    setSyncStatus("saving");
    const { error } = await supabase.from("app_state").upsert({ id: APP_STATE_ROW_ID, data: payload }, { onConflict: "id" });
    if (error) {
      setSyncStatus("error");
      setCloudError(`儲存失敗：${error.message}`);
    } else {
      setSyncStatus("saved");
      setCloudError("");
    }
  };

  const flushPendingWrite = () => {
    if (!CLOUD_ENABLED || !pendingWriteRef.current) return;
    const payload = pendingWriteRef.current;
    pendingWriteRef.current = null;
    if (writeTimeoutRef.current) { clearTimeout(writeTimeoutRef.current); writeTimeoutRef.current = null; }
    doUpsert(payload);
  };

  useEffect(() => {
    if (!CLOUD_ENABLED || !session || !cloudDataLoaded) return;
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    const snapshot = { orders, deliveryTasks, staffList, exportLog, sheetWebhookUrl };
    pendingWriteRef.current = snapshot;
    if (writeTimeoutRef.current) clearTimeout(writeTimeoutRef.current);
    writeTimeoutRef.current = setTimeout(() => {
      pendingWriteRef.current = null;
      writeTimeoutRef.current = null;
      doUpsert(snapshot);
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, deliveryTasks, staffList, exportLog, sheetWebhookUrl]);

  // 點：即使還沒到 600ms、使用者就切分頁／關閉視窗，也立刻把最新內容寫進雲端，避免遺失最後一筆變動
  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flushPendingWrite(); };
    window.addEventListener("beforeunload", flushPendingWrite);
    window.addEventListener("pagehide", flushPendingWrite);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushPendingWrite);
      window.removeEventListener("pagehide", flushPendingWrite);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const loggedInEmail = session?.user?.email?.toLowerCase() || null;
  const matchedStaff = CLOUD_ENABLED && loggedInEmail
    ? staffList.find((s) => s.email && s.email.toLowerCase() === loggedInEmail)
    : null;
  const activeStaff = CLOUD_ENABLED
    ? matchedStaff
    : (staffList.find((s) => s.id === selectedStaffId) || staffList[0]);
  const role = activeStaff?.role;
  const currentPermissions = activeStaff?.permissions;

  const logout = () => supabase.auth.signOut();

  const hasAccess = (moduleKey) => hasPerm(currentPermissions, moduleKey, "view");
  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;

  const updateOrder = (orderId, updater) =>
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...updater(o), updatedAt: Date.now() } : o)));

  const addTask = ({ type, label, orderNo, sequence, managerNote, itemName, qty, pickupFrom, deliverTo, customer, orderId, itemId, nextStepId }) => {
    setDeliveryTasks((prev) => [
      ...prev,
      {
        id: uid("task"),
        type, label, orderNo: orderNo || null, customer: customer || null,
        itemName: itemName || null, qty: qty || null, pickupFrom: pickupFrom || null, deliverTo: deliverTo || null,
        orderId: orderId || null, itemId: itemId || null, nextStepId: nextStepId || null,
        sequence: sequence !== undefined && sequence !== "" ? Number(sequence) : prev.length + 1,
        managerNote: managerNote || "",
        status: "pending",
        completedAt: null,
      },
    ]);
  };

  const handleTransition = (orderId, action, formData) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const targetStatus = action.dynamicTarget
      ? (order.plateType === "combined" ? S.COMBINED_PRODUCTION : S.IND_PRODUCTION)
      : action.to;

    const arrangingRoute = targetStatus === S.DELIVERY_ROUTE;

    if (arrangingRoute) {
      addTask({
        type: "delivery",
        label: `出貨配送：${order.customer} - ${order.product}`,
        orderNo: order.orderNo,
        customer: order.customer,
        sequence: formData.sequence,
        managerNote: formData.managerNote,
      });
    }

    const isReworkEntry = !!action.dynamicTarget;
    const enteringProduction = targetStatus === S.COMBINED_PRODUCTION || targetStatus === S.IND_PRODUCTION;

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const labeledData = {};
        (action.fields || []).forEach((f) => {
          if (formData[f.key]) labeledData[f.label] = formData[f.key];
        });
        // 報價金額另存一份專屬欄位，之後無論是否議價、走到哪個階段都能穩定取用
        const newQuotePrice = formData.quotePrice ? formData.quotePrice : o.quotePrice;
        const newQuoteOptions = formData.quoteOptions ? formData.quoteOptions : o.quoteOptions;
        // 點7：安排送貨路線後，訂單仍停留在「已開單待出貨」，等待路線安排中按下「完成訂單」
        const finalStatus = arrangingRoute ? o.status : targetStatus;
        return {
          ...o,
          status: finalStatus,
          routeArranged: arrangingRoute ? true : o.routeArranged,
          plateType: action.setPlateType ?? o.plateType,
          plateMode: action.setPlateMode ?? o.plateMode,
          quotePrice: newQuotePrice,
          quoteOptions: newQuoteOptions,
          productionStartDate: (enteringProduction && !o.productionStartDate) ? formattedToday() : o.productionStartDate,
          reworkFlag: isReworkEntry ? true : (targetStatus === S.ARRIVAL ? false : o.reworkFlag),
          reworkAt: isReworkEntry ? formattedToday() : o.reworkAt,
          meta: { ...o.meta, ...labeledData },
          updatedAt: Date.now(),
          history: [...o.history, { from: o.status, to: targetStatus, by: activeStaff.name, at: formattedToday(), note: action.label }],
        };
      })
    );
  };

  const handleStaffChange = (staffId) => {
    setSelectedStaffId(staffId);
    const staff = staffList.find((s) => s.id === staffId);
    if (staff && !hasPerm(staff.permissions, activeModule, "view")) setActiveModule(MODULE.DASHBOARD);
  };

  const nextOrderId = (prev) => Math.max(0, ...prev.map((o) => o.id)) + 1;

  const addOrder = (data) => {
    setOrders((prev) => {
      const nextId = nextOrderId(prev);
      const seq = prev.filter((o) => o.orderNo.startsWith("CR-2026-")).length + 1101;
      const orderNo = `CR-2026-${seq}`;
      return [
        ...prev,
        makeOrder(nextId, orderNo, data.customer, data.product, data.qty || "-", S.QUOTE_PENDING, {
          paper: data.paper, postProcessing: data.postProcessing,
          meta: data.note ? { 備註: data.note } : {},
          history: [{ from: null, to: S.QUOTE_PENDING, by: activeStaff.name, at: formattedToday(), note: "建立訂單" }],
        }),
      ];
    });
    setShowAddOrder(false);
  };

  const addRoutineOrder = (data) => {
    setOrders((prev) => {
      const nextId = nextOrderId(prev);
      const orderNo = `RT-2026-${prev.filter((o) => o.orderNo.startsWith("RT-2026-")).length + 1}`;
      const meta = { 建檔方式: "常規品項快速建檔（免報價）" };
      if (data.itemName) meta.品名 = data.itemName;
      if (data.spec) meta.規格 = data.spec;
      if (data.note) meta.備註 = data.note;
      return [
        ...prev,
        makeOrder(nextId, orderNo, data.customer, data.product, data.qty || "-", S.FILE_CHECKING, {
          routine: true,
          meta,
          history: [{ from: null, to: S.FILE_CHECKING, by: activeStaff.name, at: formattedToday(), note: "常規品項快速建檔，直接進入已來檔核對中" }],
        }),
      ];
    });
    setShowQuickRoutine(false);
  };

  const editOrderInfo = (orderId, data) =>
    updateOrder(orderId, (o) => ({ ...o, customer: data.customer, product: data.product, qty: data.qty }));

  const deleteOrder = (orderId) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setSelectedOrderId(null);
  };

  const revertOrder = (orderId, previousStatus) => {
    updateOrder(orderId, (o) => ({
      ...o,
      status: previousStatus,
      history: [...o.history, { from: o.status, to: previousStatus, by: activeStaff.name, at: formattedToday(), note: "手動回到上一步" }],
    }));
  };

  const onNavigateModule = (moduleKey) => {
    setActiveModule(moduleKey);
    setSelectedOrderId(null);
  };

  const addItem = (orderId, name) =>
    updateOrder(orderId, (o) => ({ ...o, items: [...(o.items || []), { id: uid("item"), name, steps: [] }] }));

  const addStep = (orderId, itemId) =>
    updateOrder(orderId, (o) => ({
      ...o,
      items: o.items.map((it) => (it.id === itemId ? { ...it, steps: [...it.steps, { id: uid("step"), label: "", done: false, scheduled: null, startDate: null }] } : it)),
    }));

  const updateStepLabel = (orderId, itemId, stepId, val) =>
    updateOrder(orderId, (o) => ({
      ...o,
      items: o.items.map((it) => (it.id === itemId ? { ...it, steps: it.steps.map((s) => (s.id === stepId ? { ...s, label: val } : s)) } : it)),
    }));

  const updateStepDate = (orderId, itemId, stepId, val) =>
    updateOrder(orderId, (o) => ({
      ...o,
      items: o.items.map((it) => (it.id === itemId ? { ...it, steps: it.steps.map((s) => (s.id === stepId ? { ...s, startDate: val } : s)) } : it)),
    }));

  const toggleStepDone = (orderId, itemId, stepId) =>
    updateOrder(orderId, (o) => ({
      ...o,
      items: o.items.map((it) => (it.id === itemId ? { ...it, steps: it.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)) } : it)),
    }));

  const deleteItem = (orderId, itemId) =>
    updateOrder(orderId, (o) => ({ ...o, items: o.items.filter((it) => it.id !== itemId) }));

  const deleteStep = (orderId, itemId, stepId) =>
    updateOrder(orderId, (o) => ({
      ...o,
      items: o.items.map((it) => (it.id === itemId ? { ...it, steps: it.steps.filter((s) => s.id !== stepId) } : it)),
    }));

  const confirmPlateProgress = (orderId) => {
    updateOrder(orderId, (o) => ({
      ...o,
      status: S.IND_PRODUCTION,
      productionStartDate: o.productionStartDate || formattedToday(),
      history: [...o.history, { from: o.status, to: S.IND_PRODUCTION, by: activeStaff.name, at: formattedToday(), note: "填寫完成，進入獨立版製作中" }],
    }));
  };

  const scheduleStep = (orderId, itemId, stepId, type) => {
    const order = orders.find((o) => o.id === orderId);
    const item = order.items.find((i) => i.id === itemId);
    const stepIdx = item.steps.findIndex((s) => s.id === stepId);
    const step = item.steps[stepIdx];
    const nextStep = item.steps[stepIdx + 1];
    const deliverTo = type === "transfer" ? (nextStep ? (nextStep.label || "未命名工序") : "完成・送回公司") : "誠瑞印刷（公司）";
    addTask({
      type,
      itemName: item.name,
      qty: order.qty,
      pickupFrom: step.label || "未命名工序",
      deliverTo,
      orderNo: order.orderNo,
      customer: order.customer,
      orderId: order.id,
      itemId: item.id,
      nextStepId: nextStep ? nextStep.id : null,
      label: type === "pickup" ? `加工取件－${item.name}` : `轉送下一站－${item.name}`,
    });
    updateOrder(orderId, (o) => ({
      ...o,
      items: o.items.map((it) => (it.id === itemId ? { ...it, steps: it.steps.map((s) => (s.id === stepId ? { ...s, scheduled: type } : s)) } : it)),
    }));
  };

  const moveTask = (id, dir) => {
    setDeliveryTasks((prev) => {
      const sorted = [...prev].sort((a, b) => a.sequence - b.sequence).map((t) => ({ ...t }));
      const idx = sorted.findIndex((t) => t.id === id);
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const tmp = sorted[idx].sequence;
      sorted[idx].sequence = sorted[swapIdx].sequence;
      sorted[swapIdx].sequence = tmp;
      return sorted;
    });
  };

  // 點2：轉送下一站任務完成時，自動在下一個加工站標記送達日期
  const toggleTaskDone = (id) => {
    const task = deliveryTasks.find((t) => t.id === id);
    if (task && task.type === "transfer" && task.status !== "done" && task.nextStepId && task.orderId && task.itemId) {
      updateOrder(task.orderId, (o) => ({
        ...o,
        items: o.items.map((it) => (it.id === task.itemId ? { ...it, steps: it.steps.map((s) => (s.id === task.nextStepId ? { ...s, startDate: formattedToday() } : s)) } : it)),
      }));
    }
    setDeliveryTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const nowDone = t.status !== "done";
        return { ...t, status: nowDone ? "done" : "pending", completedAt: nowDone ? formattedDateTime() : null };
      })
    );
  };

  const updateTaskNote = (id, val) =>
    setDeliveryTasks((prev) => prev.map((t) => (t.id === id ? { ...t, managerNote: val } : t)));

  const deleteTask = (taskId) => {
    const task = deliveryTasks.find((t) => t.id === taskId);
    if (task && task.orderNo) {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.orderNo === task.orderNo && o.status === S.DELIVERY_ROUTE) {
            return {
              ...o,
              status: S.SHIPPING_OUT,
              updatedAt: Date.now(),
              history: [...o.history, { from: o.status, to: S.SHIPPING_OUT, by: activeStaff.name, at: formattedToday(), note: "刪除送貨路線任務，退回已開單待出貨" }],
            };
          }
          return o;
        })
      );
    }
    setDeliveryTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const clearAllTasks = () => setDeliveryTasks([]);

  // 點6：一鍵清空已完成訂單
  const clearCompletedOrders = () => setOrders((prev) => prev.filter((o) => o.status !== S.DELIVERY_ROUTE));

  // 點1：一鍵清空「已完成任務」
  const clearCompletedTasks = () => setDeliveryTasks((prev) => prev.filter((t) => t.status !== "done"));

  // 點9：匯出至 Google 試算表（非常規品項），並清除獨立版製作進度表內容
  const exportOrderToSheet = (order) => {
    const shippingNote = order.meta["出貨備註（裝箱方式、庫存數量等，選填）"] || "";
    const rows = [];
    if (order.plateType === "independent" && order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        rows.push({
          id: uid("export"),
          日期: formattedToday(),
          訂單編號: order.orderNo,
          客戶名: order.customer,
          物件名: item.name,
          數量: order.qty,
          紙張: order.paper || "",
          後加工: item.steps.map((s) => s.label || "(未命名)").join("→"),
          出貨備註: shippingNote,
        });
      });
    } else {
      rows.push({
        id: uid("export"),
        日期: formattedToday(), 訂單編號: order.orderNo, 客戶名: order.customer, 物件名: order.product,
        數量: order.qty, 紙張: order.paper || "", 後加工: "", 出貨備註: shippingNote,
      });
    }
    setExportLog((prev) => [...rows, ...prev]);
    if (sheetWebhookUrl) {
      rows.forEach((row) => {
        fetch(sheetWebhookUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(row) }).catch(() => {});
      });
    }
  };

  // 點7：路線安排中按下「完成訂單」，訂單才真正離開已開單待出貨
  const completeOrderTask = (taskId) => {
    const task = deliveryTasks.find((t) => t.id === taskId);
    const now = formattedDateTime();
    if (task && task.orderNo) {
      const order = orders.find((o) => o.orderNo === task.orderNo);
      if (order) {
        if (!order.routine) exportOrderToSheet(order);
        updateOrder(order.id, (o) => ({
          ...o,
          status: S.DELIVERY_ROUTE,
          routeArranged: false,
          completedAt: now,
          items: (!o.routine && o.plateType === "independent") ? [] : o.items,
          history: [...o.history, { from: o.status, to: S.DELIVERY_ROUTE, by: activeStaff.name, at: formattedToday(), note: "完成訂單" }],
        }));
      }
    }
    setDeliveryTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: "done", completedAt: now } : t)));
  };

  // 點8：權限管理操作
  const addStaff = (name, roleValue, email) =>
    setStaffList((prev) => [...prev, { id: uid("staff"), name, email: (email || "").trim(), role: roleValue, permissions: clonePermissions(DEFAULT_ROLE_PERMISSIONS[roleValue]) }]);

  const deleteStaff = (staffId) => {
    setStaffList((prev) => {
      const next = prev.filter((s) => s.id !== staffId);
      if (staffId === selectedStaffId && next.length > 0) setSelectedStaffId(next[0].id);
      return next;
    });
  };

  // 點2：權限改為逐模組的 view／act／del／clear 四個開關
  const toggleStaffPermission = (staffId, moduleKey, flag) =>
    setStaffList((prev) =>
      prev.map((s) =>
        s.id === staffId
          ? { ...s, permissions: { ...s.permissions, [moduleKey]: { ...s.permissions[moduleKey], [flag]: !s.permissions[moduleKey]?.[flag] } } }
          : s
      )
    );

  const updateStaffEmail = (staffId, email) =>
    setStaffList((prev) => prev.map((s) => (s.id === staffId ? { ...s, email } : s)));

  const updateStaffName = (staffId, name) =>
    setStaffList((prev) => prev.map((s) => (s.id === staffId ? { ...s, name } : s)));

  // ---- 雲端模式的登入／載入畫面 ----
  if (CLOUD_ENABLED && !authChecked) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-300" />
      </div>
    );
  }
  if (CLOUD_ENABLED && !session) {
    return <LoginScreen onLogin={() => {}} />;
  }
  if (CLOUD_ENABLED && !cloudDataLoaded) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-3 font-body">
        <Loader2 size={24} className="animate-spin text-slate-300" />
        <div className="text-sm text-slate-400">正在同步雲端資料…</div>
      </div>
    );
  }
  if (CLOUD_ENABLED && !matchedStaff) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 font-body">
        <div className="max-w-sm bg-white rounded-xl shadow-xl border border-slate-100 p-6 text-center">
          <AlertTriangle size={28} className="text-amber-500 mx-auto mb-2" />
          <h2 className="font-bold text-slate-800 mb-1">帳號尚未設定權限</h2>
          <p className="text-sm text-slate-500 mb-4">
            已使用 <span className="font-mono">{loggedInEmail}</span> 登入成功，但管理員尚未在「權限管理」為此信箱建立對應的權限設定，請聯繫主管處理。
          </p>
          <button onClick={logout} className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 rounded px-4 py-2">登出</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-slate-800 flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      {CLOUD_ENABLED && cloudError && (
        <div className="bg-red-600 text-white text-xs px-4 py-2 flex items-center gap-2 flex-wrap">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="font-medium">雲端同步發生錯誤：</span>
          <span className="font-mono break-all">{cloudError}</span>
          <button onClick={() => setCloudError("")} className="ml-auto shrink-0 underline">關閉</button>
        </div>
      )}

      <header className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between font-body flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <RegistrationMark size="md" />
          <div>
            <div className="font-display font-bold text-base leading-none">誠瑞印刷</div>
            <div className="text-[11px] text-slate-400 leading-none mt-1">訂單與任務管理系統</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative hidden sm:block">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋訂單編號／客戶／品名"
              className="bg-slate-800 text-sm text-white placeholder-slate-500 rounded-full pl-8 pr-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>
          {role !== ROLE.DELIVERY && (
            <>
              <button
                onClick={() => setShowAddOrder(true)}
                className="flex items-center gap-1 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm rounded-full px-3 py-1.5 shrink-0"
              >
                <Plus size={14} /> 新增訂單
              </button>
              <button
                onClick={() => setShowQuickRoutine(true)}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-full px-3 py-1.5 shrink-0"
              >
                <Plus size={14} /> 常規品項(免報價)
              </button>
            </>
          )}
          {role === ROLE.MANAGER && (
            <button
              onClick={() => setShowPermissionsAdmin(true)}
              className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-full px-3 py-1.5 shrink-0"
            >
              <Settings size={14} /> 權限管理
            </button>
          )}
          <div className="flex items-center gap-2 bg-slate-800 rounded-full pl-3 pr-1 py-1">
            <Building2 size={14} className="text-slate-400" />
            {CLOUD_ENABLED ? (
              <>
                <span className="text-sm text-white pr-1">{activeStaff.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full mr-1 ${
                    syncStatus === "saving" ? "bg-amber-500/20 text-amber-300"
                    : syncStatus === "error" ? "bg-red-500/20 text-red-300"
                    : syncStatus === "saved" ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-slate-700 text-slate-400"
                  }`}
                  title={cloudError || ""}
                >
                  {syncStatus === "saving" ? "儲存中…" : syncStatus === "error" ? "同步失敗" : syncStatus === "saved" ? "已同步" : "待命中"}
                </span>
                <button onClick={logout} title="登出" className="text-slate-400 hover:text-white p-1">
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <select
                value={selectedStaffId}
                onChange={(e) => handleStaffChange(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none pr-1"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id} className="text-slate-900">{s.name}（{ROLE_LABELS[s.role]}）</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className={`${sidebarCollapsed ? "w-14" : "w-56"} shrink-0 bg-white border-r border-slate-100 p-3 flex flex-col gap-1 font-body transition-all`}>
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex items-center justify-center gap-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg py-1.5 mb-1"
            title={sidebarCollapsed ? "展開側邊欄" : "收合側邊欄"}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span className="text-xs">收合</span></>}
          </button>
          {!sidebarCollapsed && (
            <div className="text-[11px] text-slate-400 px-2 mb-2 leading-snug">
              {CLOUD_ENABLED ? "登入身份" : "模擬登入"}：<span className="font-medium text-slate-600">{activeStaff.name}</span>（{ROLE_LABELS[role]}）
              <div className="mt-0.5">{ROLE_DESC[role]}</div>
            </div>
          )}
          {MODULE_META.filter((m) => hasAccess(m.key)).map((m) => {
            const Icon = m.icon;
            const active = activeModule === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setActiveModule(m.key)}
                title={sidebarCollapsed ? m.label : undefined}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${sidebarCollapsed ? "justify-center px-2" : ""} ${
                  active ? "bg-fuchsia-50 text-fuchsia-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon size={16} className="shrink-0" />
                {!sidebarCollapsed && <span className="flex-1">{m.label}</span>}
                {!sidebarCollapsed && active && <ChevronRight size={14} />}
              </button>
            );
          })}
          {!sidebarCollapsed && MODULE_META.filter((m) => !hasAccess(m.key)).length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-300 px-2 mb-1">已隱藏（無權限）</div>
              {MODULE_META.filter((m) => !hasAccess(m.key)).map((m) => (
                <div key={m.key} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
                  <Lock size={12} /> {m.label}
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="flex-1 p-6 overflow-y-auto font-body">
          {activeModule === MODULE.DASHBOARD ? (
            <Dashboard orders={orders} role={role} onOpen={setSelectedOrderId} query={query} />
          ) : activeModule === MODULE.PLATE_PROGRESS ? (
            <PlateProgressBoard
              orders={orders}
              permissions={currentPermissions}
              onAddItem={addItem}
              onAddStep={addStep}
              onLabelChange={updateStepLabel}
              onToggleDone={toggleStepDone}
              onDateChange={updateStepDate}
              onSchedule={scheduleStep}
              onDeleteItem={deleteItem}
              onDeleteStep={deleteStep}
              onConfirmComplete={confirmPlateProgress}
            />
          ) : activeModule === MODULE.DELIVERY_ROUTE ? (
            <DeliveryRouteView
              tasks={deliveryTasks}
              permissions={currentPermissions}
              onAddTask={addTask}
              onMove={moveTask}
              onToggleDone={toggleTaskDone}
              onUpdateNote={updateTaskNote}
              onDeleteTask={deleteTask}
              onClearAll={clearAllTasks}
              onCompleteOrder={completeOrderTask}
            />
          ) : activeModule === MODULE.COMPLETED ? (
            <CompletedOrdersView orders={orders} onOpen={setSelectedOrderId} onClearAll={clearCompletedOrders} canClear={hasPerm(currentPermissions, MODULE.COMPLETED, "clear")} />
          ) : activeModule === MODULE.COMPLETED_TASKS ? (
            <CompletedTasksView tasks={deliveryTasks} permissions={currentPermissions} onToggleDone={toggleTaskDone} onClearAll={clearCompletedTasks} />
          ) : (
            <ModuleListView moduleKey={activeModule} orders={orders} onOpen={setSelectedOrderId} />
          )}
        </main>
      </div>

      <OrderModal
        key={selectedOrder ? selectedOrder.id : "none"}
        order={selectedOrder}
        permissions={currentPermissions}
        onClose={() => setSelectedOrderId(null)}
        onTransition={handleTransition}
        onNavigateModule={onNavigateModule}
        onEditOrder={editOrderInfo}
        onDeleteOrder={deleteOrder}
        onRevertOrder={revertOrder}
      />
      <AddOrderModal open={showAddOrder} onClose={() => setShowAddOrder(false)} onSubmit={addOrder} />
      <QuickRoutineOrderModal open={showQuickRoutine} onClose={() => setShowQuickRoutine(false)} onSubmit={addRoutineOrder} />
      <PermissionsAdminModal
        open={showPermissionsAdmin}
        onClose={() => setShowPermissionsAdmin(false)}
        staffList={staffList}
        onAddStaff={addStaff}
        onDeleteStaff={deleteStaff}
        onTogglePermission={toggleStaffPermission}
        onUpdateEmail={updateStaffEmail}
        onUpdateName={updateStaffName}
        webhookUrl={sheetWebhookUrl}
        onWebhookChange={setSheetWebhookUrl}
        exportLog={exportLog}
      />
    </div>
  );
}
