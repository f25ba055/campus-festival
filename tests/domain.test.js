"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../assets/domain.js");

function state() {
  return {
    groups: [
      { id: "G1", budget: 1000 },
      { id: "G2", budget: 0 },
      { id: "G3" },
    ],
    expenses: [
      { groupId: "G1", amount: 100, status: "approved" },
      { groupId: "G1", amount: 200, status: "submitted" },
      { groupId: "G1", amount: 300, status: "rejected" },
      { groupId: "G1", amount: 400, status: "cancelled" },
      { groupId: "G2", amount: 50, status: "approved" },
      { groupId: "G2", amount: 75, status: "submitted" },
    ],
  };
}

test("budget summary counts only approved expenses, globally and per group", () => {
  const data = state();

  assert.deepEqual(D.budgetSummary(data, "G1"), {
    budget: 1000,
    expenses: 100,
    remaining: 900,
    usageRate: 10,
    remainingRate: 90,
  });
  assert.deepEqual(D.budgetSummary(data, "G2"), {
    budget: 0,
    expenses: 50,
    remaining: -50,
    usageRate: 0,
    remainingRate: 0,
  });
  assert.equal(D.budgetSummary(data).expenses, 150);
  assert.equal(D.expenses(data, "G1"), 100);
  assert.equal(D.remaining(data, "G1"), 900);
});

test("zero and unset budgets remain distinct", () => {
  const data = state();

  assert.equal(D.budgetSummary(data, "G2").budget, 0);
  assert.equal(D.budgetSummary(data, "G3").budget, 50000);
});

test("budget values are recalculated from existing records", () => {
  const data = state();
  assert.equal(D.remaining(data, "G1"), 900);

  data.expenses[0].amount = 250;
  assert.equal(D.remaining(data, "G1"), 750);

  data.expenses[0].status = "rejected";
  assert.equal(D.remaining(data, "G1"), 1000);
});
