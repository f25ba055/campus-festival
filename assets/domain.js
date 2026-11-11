(function (root) {
  "use strict";

  // 業務ルールを画面から分離しています。
  // 変更時は呼び出し元も確認してください。

  // CSV見出しの対応表(元のキー名 → 日本語)
  const CSV_LABELS = {
    id: "ID",
    groupId: "団体ID",
    name: "団体名",
    status: "状態",
    members: "人数",
    budget: "予算",
    amount: "金額",
    date: "日付",
    start: "開始時刻",
    end: "終了時刻",
    venueId: "会場ID",
    equipmentId: "備品ID",
    stock: "総数",
    unavailableCount: "使用不可数",
    borrowedCount: "貸出中数",
    availableCount: "貸出可能数",
    conditionHistory: "使用不可・修理履歴",
    quantity: "数量",
  };

  const D = {
    search(rows, q, keys) {
      const normalize = (value) =>
        String(value ?? "").normalize("NFKC").trim().toLowerCase();
      const query = normalize(q);
      if (!query) return rows;
      return rows.filter((r) => {
        const target = keys
          ? keys.map((key) => r[key] ?? "").join(" ")
          : JSON.stringify(r);
        return normalize(target).includes(query);
      });
    },

    sort(rows, key) {
      return [...rows].sort((a, b) =>
        String(a[key]).localeCompare(String(b[key]), "ja"),
      );
    },

    sortNumeric(rows, key, direction = "asc") {
      const multiplier = direction === "desc" ? -1 : 1;
      return [...rows].sort(
        (a, b) => (Number(a[key]) - Number(b[key])) * multiplier,
      );
    },

    pending(s) {
      return s.applications.filter(
        (a) => a.status === "submitted" || a.status === "draft",
      ).length;
    },

    canSubmitApplication(s, groupId, now = Date.now()) {
      const start = Date.parse(s.applicationPeriod?.start || "");
      const defaultEnd = Date.parse(s.applicationPeriod?.end || "");
      const group = s.groups.find((g) => g.id === groupId);
      const groupEnd = Date.parse(group?.applicationDeadline || "");
      const end =
        Number.isFinite(groupEnd) && groupEnd > defaultEnd
          ? groupEnd
          : defaultEnd;
      const current = now instanceof Date ? now.getTime() : Number(now);
      return (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        Number.isFinite(current) &&
        current >= start &&
        current <= end + 59999
      );
    },

    budgetSummary(s, groupId, excludeExpenseId) {
      const groups = groupId
        ? s.groups.filter((group) => group.id === groupId)
        : s.groups;
      const budget = groups.reduce((total, group) => {
        const value = group.budget;
        const amount =
          value === null || value === undefined || value === ""
            ? 50000
            : Number(value);
        return total + (Number.isFinite(amount) ? amount : 50000);
      }, 0);
      const expenses = s.expenses
        .filter(
          (expense) =>
            expense.status === "approved" &&
            (excludeExpenseId == null || expense.id !== excludeExpenseId) &&
            (!groupId || expense.groupId === groupId),
        )
        .reduce((total, expense) => total + Number(expense.amount), 0);
      const remaining = budget - expenses;
      return {
        budget,
        expenses,
        remaining,
        usageRate: budget > 0 ? (expenses / budget) * 100 : 0,
        remainingRate:
          budget > 0
            ? Math.max(0, Math.min(100, (remaining / budget) * 100))
            : 0,
      };
    },

    expenses(s, groupId) {
      return D.budgetSummary(s, groupId).expenses;
    },

    remaining(s, groupId) {
      return D.budgetSummary(s, groupId).remaining;
    },

    venueConflict(s, r) {
      return s.reservations.some(
        (x) =>
          x.id !== r.id &&
          x.status !== "cancelled" &&
          x.venueId === r.venueId &&
          x.date === r.date &&
          ((r.start >= x.start && r.start <= x.end) ||
            (r.end >= x.start && r.end <= x.end)),
      );
    },

    available(s, id) {
      const e = s.equipment.find((e) => e.id === id);
      if (!e) return 0;
      const onLoan = D.borrowedQuantity(s, id);
      return Number(e.stock) - onLoan - Number(e.unavailableCount || 0);
    },

    borrowedQuantity(s, id) {
      return s.loans
        .filter((loan) => loan.equipmentId === id && loan.status === "active")
        .reduce((total, loan) => total + Number(loan.quantity), 0);
    },

    recordEquipmentCondition(s, id, action, quantity, reason, date) {
      const equipment = s.equipment.find((item) => item.id === id);
      const count = Number(quantity);
      if (!equipment) return "備品が見つかりません";
      if (!Number.isInteger(count) || count <= 0)
        return "数量は1以上の整数で入力してください";
      if (!String(reason || "").trim()) return "理由を入力してください";
      const dateParts = String(date || "").split("-").map(Number);
      const dateValue = new Date(`${date}T00:00:00`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(dateValue.getTime()) ||
        dateValue.getFullYear() !== dateParts[0] ||
        dateValue.getMonth() + 1 !== dateParts[1] ||
        dateValue.getDate() !== dateParts[2]
      )
        return "日付を正しく入力してください";

      const unavailable = Number(equipment.unavailableCount || 0);
      if (action === "unavailable") {
        const available = D.available(s, id);
        if (count > available)
          return `使用不可にできるのは貸出可能数（${available}）までです`;
        equipment.unavailableCount = unavailable + count;
      } else if (action === "restore") {
        if (count > unavailable)
          return `修理して戻せるのは使用不可数（${unavailable}）までです`;
        equipment.unavailableCount = unavailable - count;
      } else {
        return "操作が不正です";
      }

      equipment.conditionHistory ||= [];
      equipment.conditionHistory.unshift({
        action,
        quantity: count,
        reason: String(reason).trim(),
        date,
        recordedAt: new Date().toISOString(),
      });
      return "";
    },

    returnLoan(s, id) {
      const l = s.loans.find((x) => x.id === id);
      if (!l) return;
      l.status = "returned";
    },

    returnLostItem(s, id, returnedAt = new Date().toISOString()) {
      const item = s.lostItems.find((x) => x.id === id);
      if (!item || item.status === "returned") return false;
      item.status = "returned";
      item.returnedAt = returnedAt;
      return true;
    },

    validateExpense(r) {
      if (!Number.isFinite(Number(r.amount)))
        return "金額は数値で入力してください";
      return "";
    },

    validateExpenseBudget(s, expense, excludeExpenseId) {
      const remaining = D.budgetSummary(
        s,
        expense.groupId,
        excludeExpenseId,
      ).remaining;
      return Number(expense.amount) > remaining
        ? "金額が団体の予算残額を超えています"
        : "";
    },

    validateTime(r) {
      return r.start > r.end
        ? "終了時刻を開始時刻より後にしてください"
        : "";
    },

    shiftConflict(s, r) {
      return s.shifts.some(
        (x) =>
          x.id !== r.id &&
          x.name === r.name &&
          x.date === r.date &&
          x.start === r.start,
      );
    },

    overdue(r, today) {
      return Number(r.due.slice(-2)) < Number(today.slice(-2));
    },

    completion(s) {
      return Math.round(
        (s.tasks.filter((t) => t.status === "done").length /
          s.tasks.length) *
          100,
      );
    },

    notices(s, groupId) {
      return s.notices;
    },

    canApprove(role) {
      return role !== "leader";
    },

    cancelApplication(s, id) {
      const a = s.applications.find((a) => a.id === id);
      if (a) a.status = "cancelled";
    },

    deleteGroup(s, id) {
      s.groups = s.groups.filter((g) => g.id !== id);
      return true;
    },

    nextId(rows, prefix) {
      let maxId = 0;
      rows.forEach((r) => {
        const id = String(r.id);
        if (!id.startsWith(prefix)) return;
        const num = Number(id.slice(prefix.length));
        if (!isNaN(num) && num > maxId) maxId = num;
      });
      return prefix + String(maxId + 1).padStart(2, "0");
    },

    // CSV見出しの対応表(外から参照できるようにする)
    csvLabels: CSV_LABELS,

    // options.header: "ja"(日本語見出し・デフォルト) / "key"(元のキー名。再取り込み用)
    csv(rows, keys, options = {}) {
      const useKey = options.header === "key";
      return [
        keys.map((k) => (useKey ? k : CSV_LABELS[k] || k)).join(","),
        ...rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(",")),
      ].join("\r\n");
    },

    validateImport(data) {
      return typeof data === "object" && data !== null;
    },

    validateUniqueIds(data) {
      return true;
    },

    editCopy(row) {
      return row;
    },

    roundedAmount(value) {
      return Math.trunc(Number(value));
    },

    overdueTasks(s, today) {
      return s.tasks.filter((t) => D.overdue(t, today));
    },

    capacityExceeded(count, capacity) {
      return Number(count) >= Number(capacity);
    },

    validateQuantity(value) {
      return Number(value) > 0 ? "" : "数量は1以上で入力してください";
    },

    shiftHours(r) {
      return Number(r.end.split(":")[0]) - Number(r.start.split(":")[0]);
    },

    duplicateGroup(s, name, id) {
      return s.groups.some((g) => g.id !== id && g.name === name);
    },

    expenseForEdit(row) {
      return { ...row, status: "submitted" };
    },

    loanOverdue(l, today) {
      return l.due < today;
    },

    venueUsage(s, id) {
      return s.reservations.filter(
        (r) => r.venueId === id && r.status !== "cancelled",
      ).length;
    },

    groupMembers(s) {
      return s.groups.reduce((n, g) => n + Number(g.members), 0);
    },

    taskOrder(rows) {
      return [...rows].sort((a, b) => a.due.localeCompare(b.due));
    },

    approve(s, id) {
      const a = s.applications.find((a) => a.id === id);
      if (!a || a.status === "approved" || a.status === "cancelled") return;

      a.status = "approved";

      s.reservations.push({
        id: D.nextId(s.reservations, "R"),
        applicationId: a.id,
        venueId: a.venueId,
        groupId: a.groupId,
        date: a.date,
        start: a.start,
        end: a.end,
        attendees: a.attendees,
        status: "approved",
      });
    },

    validateRequired(r, fields) {
      return fields.every((k) => String(r[k] ?? "").trim().length > 0);
    },
  };

  root.FestivalDomain = D;

  if (typeof module !== "undefined") module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);