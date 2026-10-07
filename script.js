/* =========================================================
   TRIPMATE
   Firebase Realtime Database REST CONNECTION
========================================================= */

const DB_URL =
    "https://tripmate-378b6-default-rtdb.asia-southeast1.firebasedatabase.app";


/* =========================================================
   APP STATE
========================================================= */

const state = {
    trips: [],
    currentView: "dashboard",
    currentVaultTripId: "",
    currentItineraryTripId: "",
    expenseTripId: "",
    itineraryTripId: "",
    syncTimer: null,
    loading: false
};


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

const $$ = (selector) =>
    document.querySelectorAll(selector);


/* =========================================================
   DATABASE API
========================================================= */

async function dbRequest(path = "", options = {}) {

    const cleanPath = path
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");

    const url =
        `${DB_URL}${cleanPath ? "/" + cleanPath : ""}.json`;

    const requestOptions = {
        method: options.method || "GET",
        headers: {
            "Content-Type": "application/json"
        }
    };

    if (options.body !== undefined) {
        requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, requestOptions);

    if (!response.ok) {

        let message = `Database request failed (${response.status})`;

        try {
            const errorData = await response.json();

            if (errorData && errorData.error) {
                message = errorData.error;
            }

        } catch (error) {
            // Ignore JSON parsing failure
        }

        throw new Error(message);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}


/* =========================================================
   DATABASE FUNCTIONS
========================================================= */

async function loadTrips(showToastMessage = false) {

    if (state.loading) {
        return;
    }

    state.loading = true;

    try {

        const data = await dbRequest("/trips");

        const oldSelectedVault = state.currentVaultTripId;
        const oldSelectedItinerary = state.currentItineraryTripId;

        if (!data) {
            state.trips = [];
        } else {
            state.trips = Object.values(data)
                .filter(Boolean)
                .map(normalizeTrip);
        }

        state.trips.sort((a, b) => {
            return new Date(b.createdAt || 0) -
                   new Date(a.createdAt || 0);
        });

        setDatabaseStatus(true);

        updateDashboard();
        renderTrips();
        populateTripSelectors();

        if (oldSelectedVault) {
            const exists = state.trips.some(
                trip => trip.id === oldSelectedVault
            );

            if (exists) {
                state.currentVaultTripId = oldSelectedVault;
                $("vaultTripSelect").value = oldSelectedVault;
                renderVault();
            }
        }

        if (oldSelectedItinerary) {
            const exists = state.trips.some(
                trip => trip.id === oldSelectedItinerary
            );

            if (exists) {
                state.currentItineraryTripId =
                    oldSelectedItinerary;

                $("itineraryTripSelect").value =
                    oldSelectedItinerary;

                renderItinerary();
            }
        }

        updateLastSync();

        if (showToastMessage) {
            showToast("Database synced successfully", "success");
        }

    } catch (error) {

        console.error("Firebase error:", error);

        setDatabaseStatus(false);

        if (showToastMessage) {
            showToast(
                "Database connection failed: " + error.message,
                "error"
            );
        }

    } finally {

        state.loading = false;
    }
}


async function saveTrip(trip) {

    trip.updatedAt = new Date().toISOString();

    await dbRequest(
        `/trips/${trip.id}`,
        {
            method: "PUT",
            body: trip
        }
    );

    const index = state.trips.findIndex(
        item => item.id === trip.id
    );

    if (index >= 0) {
        state.trips[index] = normalizeTrip(trip);
    } else {
        state.trips.unshift(normalizeTrip(trip));
    }

    updateDashboard();
    renderTrips();
    populateTripSelectors();
}


async function removeTrip(tripId) {

    await dbRequest(
        `/trips/${tripId}`,
        {
            method: "DELETE"
        }
    );

    state.trips =
        state.trips.filter(
            trip => trip.id !== tripId
        );

    if (state.currentVaultTripId === tripId) {
        state.currentVaultTripId = "";
        $("vaultTripSelect").value = "";
        renderVault();
    }

    if (state.currentItineraryTripId === tripId) {
        state.currentItineraryTripId = "";
        $("itineraryTripSelect").value = "";
        renderItinerary();
    }

    updateDashboard();
    renderTrips();
    populateTripSelectors();
}


/* =========================================================
   NORMALIZE DATA
========================================================= */

function normalizeTrip(trip) {

    return {
        id: trip.id || createId("trip"),

        name: trip.name || "Untitled Trip",

        startDate: trip.startDate || "",

        endDate: trip.endDate || "",

        days: Number(trip.days || 0),

        budget: Number(trip.budget || 0),

        travelType: trip.travelType || "Car",

        memberCount:
            Number(trip.memberCount || 1),

        members:
            Array.isArray(trip.members)
                ? trip.members
                : [],

        places:
            Array.isArray(trip.places)
                ? trip.places
                : [],

        expenses:
            Array.isArray(trip.expenses)
                ? trip.expenses
                : [],

        itinerary:
            Array.isArray(trip.itinerary)
                ? trip.itinerary
                : [],

        createdAt:
            trip.createdAt ||
            new Date().toISOString(),

        updatedAt:
            trip.updatedAt ||
            new Date().toISOString()
    };
}


/* =========================================================
   ID GENERATOR
========================================================= */

function createId(prefix = "id") {

    return (
        prefix +
        "_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .substring(2, 9)
    );
}


/* =========================================================
   CURRENCY
========================================================= */

function money(value) {

    return new Intl.NumberFormat(
        "en-IN",
        {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0
        }
    ).format(Number(value || 0));
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   DATE FUNCTIONS
========================================================= */

function formatDate(dateString) {

    if (!dateString) {
        return "Date not set";
    }

    const date = new Date(dateString + "T00:00:00");

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );
}


function shortDate(dateString) {

    if (!dateString) {
        return "--";
    }

    const date = new Date(dateString + "T00:00:00");

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short"
        }
    );
}


function todayString() {

    const date = new Date();

    const year = date.getFullYear();

    const month =
        String(date.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(date.getDate())
            .padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/* =========================================================
   TRIP STATUS
========================================================= */

function getTripStatus(trip) {

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!trip.startDate) {
        return "upcoming";
    }

    const start =
        new Date(trip.startDate + "T00:00:00");

    let end = trip.endDate
        ? new Date(trip.endDate + "T23:59:59")
        : new Date(start);

    if (!trip.endDate && trip.days > 1) {

        end = new Date(start);

        end.setDate(
            start.getDate() + trip.days - 1
        );
    }

    if (today < start) {
        return "upcoming";
    }

    if (today >= start && today <= end) {
        return "active";
    }

    return "completed";
}


function statusLabel(status) {

    if (status === "active") {
        return "Active";
    }

    if (status === "completed") {
        return "Completed";
    }

    return "Upcoming";
}


/* =========================================================
   SPENDING
========================================================= */

function totalSpent(trip) {

    return trip.expenses.reduce(
        (sum, expense) =>
            sum + Number(expense.amount || 0),
        0
    );
}


function remainingBudget(trip) {

    return Number(trip.budget || 0) -
           totalSpent(trip);
}


/* =========================================================
   DATABASE STATUS
========================================================= */

function setDatabaseStatus(online) {

    const dot = $("syncDot");
    const topDot = $("topStatusDot");

    const text = $("syncText");
    const topText = $("topStatusText");

    if (online) {

        dot.classList.add("online");
        dot.classList.remove("error");

        topDot.classList.add("online");
        topDot.classList.remove("error");

        text.textContent = "Database Connected";
        topText.textContent = "Connected";

    } else {

        dot.classList.remove("online");
        dot.classList.add("error");

        topDot.classList.remove("online");
        topDot.classList.add("error");

        text.textContent = "Connection Error";
        topText.textContent = "Offline";
    }
}


function updateLastSync() {

    $("lastSync").textContent =
        "Last sync: " +
        new Date().toLocaleTimeString(
            "en-IN",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );
}


/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {

    const trips = state.trips;

    const active =
        trips.filter(
            trip => getTripStatus(trip) === "active"
        ).length;

    const budget =
        trips.reduce(
            (sum, trip) =>
                sum + Number(trip.budget || 0),
            0
        );

    const spent =
        trips.reduce(
            (sum, trip) =>
                sum + totalSpent(trip),
            0
        );

    $("statTrips").textContent = trips.length;

    $("statActive").textContent = active;

    $("statBudget").textContent = money(budget);

    $("statSpent").textContent = money(spent);

    renderDashboardTrips();
}


/* =========================================================
   DASHBOARD TRIPS
========================================================= */

function renderDashboardTrips() {

    const container = $("dashboardTrips");

    const trips = state.trips.slice(0, 3);

    if (!trips.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✈</div>
                <h3>No trips yet</h3>
                <p>Create your first trip to get started.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        trips.map(renderTripCard).join("");
}


/* =========================================================
   ALL TRIPS
========================================================= */

function renderTrips() {

    const container = $("allTrips");

    const search =
        ($("tripSearch")?.value || "")
            .trim()
            .toLowerCase();

    const filter =
        $("tripFilter")?.value || "all";

    let trips = [...state.trips];

    if (search) {

        trips = trips.filter(trip => {

            const text = [
                trip.name,
                trip.travelType,
                ...trip.members,
                ...trip.places
            ]
                .join(" ")
                .toLowerCase();

            return text.includes(search);
        });
    }

    if (filter !== "all") {

        trips = trips.filter(
            trip =>
                getTripStatus(trip) === filter
        );
    }

    if (!trips.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⌕</div>
                <h3>No matching trips</h3>
                <p>Try another search or create a new trip.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        trips.map(renderTripCard).join("");
}


/* =========================================================
   TRIP CARD
========================================================= */

function renderTripCard(trip) {

    const status =
        getTripStatus(trip);

    const spent =
        totalSpent(trip);

    const coverClasses = [
        "",
        "green",
        "orange",
        "purple"
    ];

    const cover =
        coverClasses[
            Math.abs(hashCode(trip.id)) %
            coverClasses.length
        ];

    return `
        <article class="trip-card">

            <div class="trip-cover ${cover}">

                <span class="trip-status">
                    ${escapeHTML(statusLabel(status))}
                </span>

                <div class="trip-cover-icon">
                    ✈
                </div>

            </div>

            <div class="trip-body">

                <h3>${escapeHTML(trip.name)}</h3>

                <div class="trip-date">
                    ${formatDate(trip.startDate)}
                    ${trip.endDate
                        ? " — " + formatDate(trip.endDate)
                        : ""}
                </div>

                <div class="trip-info">

                    <span class="info-chip">
                        ${escapeHTML(trip.travelType)}
                    </span>

                    <span class="info-chip">
                        👥 ${trip.members.length || trip.memberCount}
                    </span>

                    <span class="info-chip">
                        📍 ${trip.places.length} places
                    </span>

                </div>

                <div class="trip-footer">

                    <div>

                        <div class="trip-budget">
                            ${money(trip.budget)}
                        </div>

                        <div style="font-size:10px;color:#8a92a2;margin-top:3px;">
                            ${money(spent)} spent
                        </div>

                    </div>

                    <div class="trip-actions">

                        <button
                            class="small-btn"
                            data-action="vault"
                            data-id="${escapeHTML(trip.id)}"
                        >
                            Vault
                        </button>

                        <button
                            class="small-btn"
                            data-action="itinerary"
                            data-id="${escapeHTML(trip.id)}"
                        >
                            Plan
                        </button>

                        <button
                            class="small-btn delete"
                            data-action="delete"
                            data-id="${escapeHTML(trip.id)}"
                        >
                            Delete
                        </button>

                    </div>

                </div>

            </div>

        </article>
    `;
}


function hashCode(value) {

    let hash = 0;

    for (let i = 0; i < value.length; i++) {

        hash =
            ((hash << 5) - hash) +
            value.charCodeAt(i);

        hash |= 0;
    }

    return hash;
}


/* =========================================================
   NAVIGATION
========================================================= */

function showView(viewName) {

    state.currentView = viewName;

    $$(".view").forEach(view => {
        view.classList.remove("active");
    });

    const target =
        $(`view-${viewName}`);

    if (target) {
        target.classList.add("active");
    }

    $$(".nav-btn").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.view === viewName
        );
    });

    const titles = {
        dashboard: "Dashboard",
        trips: "My Trips",
        vault: "Budget Vault",
        itinerary: "Itinerary"
    };

    const kickers = {
        dashboard: "TRAVEL ASSISTANT",
        trips: "YOUR JOURNEYS",
        vault: "MONEY MANAGEMENT",
        itinerary: "TRIP PLANNER"
    };

    $("pageTitle").textContent =
        titles[viewName] || "TripMate";

    $("pageKicker").textContent =
        kickers[viewName] || "TRIPMATE";
}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {

    const modal = $(id);

    if (modal) {
        modal.classList.add("show");
    }
}


function closeModal(id) {

    const modal = $(id);

    if (modal) {
        modal.classList.remove("show");
    }
}


/* =========================================================
   MEMBER FIELDS
========================================================= */

function renderMemberFields() {

    const count =
        Math.max(
            1,
            Math.min(
                30,
                Number($("memberCount").value || 1)
            )
        );

    const container =
        $("memberFields");

    const existing =
        [...container.querySelectorAll("input")]
            .map(input => input.value);

    let html = "";

    for (let i = 0; i < count; i++) {

        html += `
            <div class="member-field">

                <span class="member-number">
                    ${i + 1}
                </span>

                <input
                    type="text"
                    class="member-input"
                    placeholder="Member ${i + 1}"
                    value="${escapeHTML(existing[i] || "")}"
                >

            </div>
        `;
    }

    container.innerHTML = html;
}


/* =========================================================
   CREATE TRIP
========================================================= */

async function createTrip(event) {

    event.preventDefault();

    const name =
        $("tripName").value.trim();

    const startDate =
        $("startDate").value;

    if (!name || !startDate) {

        showToast(
            "Please enter trip name and start date",
            "error"
        );

        return;
    }

    const members =
        [...document.querySelectorAll(".member-input")]
            .map(input => input.value.trim())
            .filter(Boolean);

    const places =
        $("places").value
            .split(/[\n,]+/)
            .map(place => place.trim())
            .filter(Boolean);

    const trip = {

        id: createId("trip"),

        name,

        startDate,

        endDate:
            $("endDate").value || "",

        days:
            Number($("tripDays").value || 0),

        budget:
            Number($("tripBudget").value || 0),

        travelType:
            $("travelType").value,

        memberCount:
            Number($("memberCount").value || members.length || 1),

        members,

        places,

        expenses: [],

        itinerary: [],

        createdAt:
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()
    };


    try {

        await saveTrip(trip);

        closeModal("tripModal");

        $("tripForm").reset();

        $("memberCount").value = 2;

        renderMemberFields();

        showToast(
            "Trip created and saved to Firebase",
            "success"
        );

        showView("trips");

    } catch (error) {

        console.error(error);

        showToast(
            "Could not save trip: " + error.message,
            "error"
        );
    }
}


/* =========================================================
   POPULATE SELECTORS
========================================================= */

function populateTripSelectors() {

    const vaultSelect =
        $("vaultTripSelect");

    const itinerarySelect =
        $("itineraryTripSelect");

    const currentVault =
        state.currentVaultTripId ||
        vaultSelect.value;

    const currentItinerary =
        state.currentItineraryTripId ||
        itinerarySelect.value;

    const options = state.trips.map(trip => {

        return `
            <option value="${escapeHTML(trip.id)}">
                ${escapeHTML(trip.name)}
            </option>
        `;

    }).join("");

    vaultSelect.innerHTML =
        `<option value="">Select a trip</option>` +
        options;

    itinerarySelect.innerHTML =
        `<option value="">Select a trip</option>` +
        options;

    if (
        state.trips.some(
            trip => trip.id === currentVault
        )
    ) {

        vaultSelect.value = currentVault;
        state.currentVaultTripId = currentVault;
        renderVault();
    }

    if (
        state.trips.some(
            trip => trip.id === currentItinerary
        )
    ) {

        itinerarySelect.value =
            currentItinerary;

        state.currentItineraryTripId =
            currentItinerary;

        renderItinerary();
    }
}


/* =========================================================
   VAULT
========================================================= */

function getTrip(tripId) {

    return state.trips.find(
        trip => trip.id === tripId
    );
}


function renderVault() {

    const trip =
        getTrip(state.currentVaultTripId);

    const container =
        $("vaultContent");

    if (!trip) {

        container.innerHTML = `
            <div class="empty-state large-empty">
                <div class="empty-icon">₹</div>
                <h3>Select a trip</h3>
                <p>Select a trip above to view its budget vault.</p>
            </div>
        `;

        return;
    }

    const spent =
        totalSpent(trip);

    const remaining =
        remainingBudget(trip);

    const expenses =
        [...trip.expenses]
            .sort(
                (a, b) =>
                    new Date(b.date || 0) -
                    new Date(a.date || 0)
            );

    container.innerHTML = `

        <div class="vault-overview">

            <div class="vault-main">

                <span>AVAILABLE BALANCE</span>

                <h2>${money(remaining)}</h2>

                <p>
                    ${money(trip.budget)} total budget
                </p>

            </div>

            <div class="vault-mini spent">

                <span>TOTAL SPENT</span>

                <strong>${money(spent)}</strong>

            </div>

            <div class="vault-mini total">

                <span>TOTAL BUDGET</span>

                <strong>${money(trip.budget)}</strong>

            </div>

        </div>

        <div class="expense-panel">

            <div class="panel-heading">

                <div>
                    <h3>Expenses</h3>

                    <p style="font-size:10px;color:#8a92a2;margin-top:4px;">
                        ${expenses.length} expense${expenses.length === 1 ? "" : "s"}
                    </p>
                </div>

                <button
                    class="primary-btn"
                    id="addExpenseButton"
                >
                    + Add Expense
                </button>

            </div>

            <div class="expense-list">

                ${
                    expenses.length
                    ? expenses.map(
                        expense =>
                            renderExpense(expense, trip)
                      ).join("")
                    : `
                        <div class="empty-state" style="min-height:160px;">
                            <div class="empty-icon">₹</div>
                            <h3>No expenses yet</h3>
                            <p>Add your first expense.</p>
                        </div>
                    `
                }

            </div>

        </div>
    `;

    $("addExpenseButton")
        .addEventListener(
            "click",
            () => openExpenseModal(trip.id)
        );
}


function renderExpense(expense, trip) {

    const member =
        expense.member ||
        "Trip Member";

    return `

        <div class="expense-item">

            <div class="expense-left">

                <div class="expense-icon">
                    ${expense.category === "Food"
                        ? "🍴"
                        : expense.category === "Hotel"
                        ? "🏨"
                        : expense.category === "Transport"
                        ? "🚗"
                        : expense.category === "Tickets"
                        ? "🎟"
                        : "₹"}
                </div>

                <div>

                    <strong>
                        ${escapeHTML(expense.purpose)}
                    </strong>

                    <small>
                        ${escapeHTML(expense.category || "Other")}
                        •
                        ${escapeHTML(member)}
                        •
                        ${formatDate(expense.date)}
                    </small>

                </div>

            </div>

            <div style="display:flex;align-items:center;gap:10px;">

                <span class="expense-amount">
                    -${money(expense.amount)}
                </span>

                <button
                    class="small-btn delete"
                    data-expense-delete="${escapeHTML(expense.id)}"
                >
                    ×
                </button>

            </div>

        </div>
    `;
}


/* =========================================================
   EXPENSE MODAL
========================================================= */

function openExpenseModal(tripId) {

    state.expenseTripId = tripId;

    const trip =
        getTrip(tripId);

    if (!trip) {
        return;
    }

    const select =
        $("expenseMember");

    select.innerHTML =
        `<option value="">Select member</option>` +
        trip.members.map(member => `
            <option value="${escapeHTML(member)}">
                ${escapeHTML(member)}
            </option>
        `).join("");

    $("expenseDate").value =
        todayString();

    $("expenseForm").reset();

    $("expenseDate").value =
        todayString();

    openModal("expenseModal");
}


async function createExpense(event) {

    event.preventDefault();

    const trip =
        getTrip(state.expenseTripId);

    if (!trip) {
        return;
    }

    const amount =
        Number($("expenseAmount").value);

    const purpose =
        $("expensePurpose").value.trim();

    if (!amount || amount <= 0 || !purpose) {

        showToast(
            "Enter a valid amount and purpose",
            "error"
        );

        return;
    }

    const expense = {

        id: createId("expense"),

        amount,

        purpose,

        category:
            $("expenseCategory").value,

        member:
            $("expenseMember").value || "Not specified",

        date:
            $("expenseDate").value ||
            todayString(),

        createdAt:
            new Date().toISOString()
    };

    trip.expenses.push(expense);

    try {

        await saveTrip(trip);

        closeModal("expenseModal");

        $("expenseForm").reset();

        renderVault();

        showToast(
            "Expense added and budget updated",
            "success"
        );

    } catch (error) {

        trip.expenses =
            trip.expenses.filter(
                item => item.id !== expense.id
            );

        showToast(
            "Could not save expense: " + error.message,
            "error"
        );
    }
}


/* =========================================================
   DELETE EXPENSE
========================================================= */

async function deleteExpense(expenseId) {

    const trip =
        getTrip(state.currentVaultTripId);

    if (!trip) {
        return;
    }

    const expense =
        trip.expenses.find(
            item => item.id === expenseId
        );

    if (!expense) {
        return;
    }

    const confirmed =
        confirm(
            `Delete expense "${expense.purpose}" of ${money(expense.amount)}?`
        );

    if (!confirmed) {
        return;
    }

    const oldExpenses =
        [...trip.expenses];

    trip.expenses =
        trip.expenses.filter(
            item => item.id !== expenseId
        );

    try {

        await saveTrip(trip);

        renderVault();

        showToast(
            "Expense deleted",
            "success"
        );

    } catch (error) {

        trip.expenses = oldExpenses;

        showToast(
            "Could not delete expense",
            "error"
        );
    }
}


/* =========================================================
   ITINERARY
========================================================= */

function renderItinerary() {

    const trip =
        getTrip(state.currentItineraryTripId);

    const container =
        $("itineraryContent");

    if (!trip) {

        container.innerHTML = `
            <div class="empty-state large-empty">
                <div class="empty-icon">☷</div>
                <h3>Select a trip</h3>
                <p>Select a trip to view its itinerary.</p>
            </div>
        `;

        return;
    }

    const plans =
        [...trip.itinerary]
            .sort(
                (a, b) =>
                    new Date(a.date || 0) -
                    new Date(b.date || 0)
            );

    container.innerHTML = `

        <div class="itinerary-layout">

            <div class="places-panel">

                <div class="panel-heading">

                    <div>
                        <h3>Places to Visit</h3>
                        <p style="font-size:10px;color:#8a92a2;margin-top:4px;">
                            ${trip.places.length} destination${trip.places.length === 1 ? "" : "s"}
                        </p>
                    </div>

                    <button
                        class="small-btn"
                        id="addPlaceButton"
                    >
                        + Add Plan
                    </button>

                </div>

                <div class="place-list">

                    ${
                        trip.places.length
                        ? trip.places.map(
                            place => `
                                <span class="place-chip">
                                    📍 ${escapeHTML(place)}
                                </span>
                            `
                          ).join("")
                        : `
                            <p style="color:#8a92a2;font-size:11px;">
                                No places were added.
                            </p>
                        `
                    }

                </div>

            </div>


            <div class="itinerary-panel">

                <div class="panel-heading">

                    <div>
                        <h3>Daily Plans</h3>
                        <p style="font-size:10px;color:#8a92a2;margin-top:4px;">
                            ${plans.length} plan${plans.length === 1 ? "" : "s"}
                        </p>
                    </div>

                    <button
                        class="primary-btn"
                        id="addItineraryButton"
                    >
                        + Add
                    </button>

                </div>

                <div class="plan-list">

                    ${
                        plans.length
                        ? plans.map(
                            plan =>
                                renderPlan(plan)
                          ).join("")
                        : `
                            <div class="empty-state" style="min-height:160px;">
                                <div class="empty-icon">☷</div>
                                <h3>No plans yet</h3>
                                <p>Add your first itinerary item.</p>
                            </div>
                        `
                    }

                </div>

            </div>

        </div>
    `;

    $("addPlaceButton")
        .addEventListener(
            "click",
            () => openPlaceModal(trip.id)
        );

    $("addItineraryButton")
        .addEventListener(
            "click",
            () => openPlaceModal(trip.id)
        );
}


function renderPlan(plan) {

    const date =
        plan.date
            ? new Date(plan.date + "T00:00:00")
            : null;

    const day =
        date
            ? date.getDate()
            : "--";

    const month =
        date
            ? date.toLocaleDateString(
                "en-IN",
                { month: "short" }
              )
            : "---";

    return `

        <div class="plan-item">

            <div class="plan-date">

                <span>${day}</span>

                ${month}

            </div>

            <div class="plan-info" style="flex:1;">

                <h4>
                    ${escapeHTML(plan.title)}
                </h4>

                <p>
                    ${escapeHTML(
                        plan.notes || "No notes added."
                    )}
                </p>

            </div>

            <button
                class="small-btn delete"
                data-plan-delete="${escapeHTML(plan.id)}"
            >
                ×
            </button>

        </div>
    `;
}


/* =========================================================
   PLACE / ITINERARY MODAL
========================================================= */

function openPlaceModal(tripId) {

    state.itineraryTripId = tripId;

    $("placeForm").reset();

    const trip =
        getTrip(tripId);

    if (trip && trip.startDate) {
        $("planDate").value =
            trip.startDate;
    } else {
        $("planDate").value =
            todayString();
    }

    openModal("placeModal");
}


async function createPlan(event) {

    event.preventDefault();

    const trip =
        getTrip(state.itineraryTripId);

    if (!trip) {
        return;
    }

    const title =
        $("planTitle").value.trim();

    const date =
        $("planDate").value;

    if (!title || !date) {

        showToast(
            "Enter a date and place/activity",
            "error"
        );

        return;
    }

    const plan = {

        id: createId("plan"),

        date,

        title,

        notes:
            $("planNotes").value.trim(),

        createdAt:
            new Date().toISOString()
    };

    trip.itinerary.push(plan);

    /*
       If the entered title is not already in
       the trip places list, add it as a place.
    */

    const alreadyExists =
        trip.places.some(
            place =>
                place.toLowerCase() ===
                title.toLowerCase()
        );

    if (!alreadyExists) {
        trip.places.push(title);
    }

    try {

        await saveTrip(trip);

        closeModal("placeModal");

        $("placeForm").reset();

        renderItinerary();

        showToast(
            "Itinerary updated and saved",
            "success"
        );

    } catch (error) {

        trip.itinerary =
            trip.itinerary.filter(
                item => item.id !== plan.id
            );

        showToast(
            "Could not save itinerary",
            "error"
        );
    }
}


/* =========================================================
   DELETE PLAN
========================================================= */

async function deletePlan(planId) {

    const trip =
        getTrip(state.currentItineraryTripId);

    if (!trip) {
        return;
    }

    const oldPlans =
        [...trip.itinerary];

    trip.itinerary =
        trip.itinerary.filter(
            plan => plan.id !== planId
        );

    try {

        await saveTrip(trip);

        renderItinerary();

        showToast(
            "Plan removed",
            "success"
        );

    } catch (error) {

        trip.itinerary = oldPlans;

        showToast(
            "Could not remove plan",
            "error"
        );
    }
}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function showToast(message, type = "success") {

    const toast =
        $("toast");

    const icon =
        $("toastIcon");

    const messageElement =
        $("toastMessage");

    messageElement.textContent =
        message;

    icon.textContent =
        type === "error"
            ? "!"
            : "✓";

    icon.style.background =
        type === "error"
            ? "var(--red)"
            : "var(--green)";

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer =
        setTimeout(
            () => {
                toast.classList.remove("show");
            },
            3000
        );
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        /* Navigation */

        $$(".nav-btn").forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    showView(
                        button.dataset.view
                    );
                }
            );

        });


        /* New trip buttons */

        $("openTripModal")
            .addEventListener(
                "click",
                () => openModal("tripModal")
            );

        $("topNewTrip")
            .addEventListener(
                "click",
                () => openModal("tripModal")
            );

        $("dashboardNewTrip")
            .addEventListener(
                "click",
                () => openModal("tripModal")
            );

        $("tripsNewTrip")
            .addEventListener(
                "click",
                () => openModal("tripModal")
            );


        /* View all */

        $("viewAllTrips")
            .addEventListener(
                "click",
                () => showView("trips")
            );


        /* Member count */

        $("memberCount")
            .addEventListener(
                "input",
                renderMemberFields
            );


        /* Forms */

        $("tripForm")
            .addEventListener(
                "submit",
                createTrip
            );

        $("expenseForm")
            .addEventListener(
                "submit",
                createExpense
            );

        $("placeForm")
            .addEventListener(
                "submit",
                createPlan
            );


        /* Search */

        $("tripSearch")
            .addEventListener(
                "input",
                renderTrips
            );

        $("tripFilter")
            .addEventListener(
                "change",
                renderTrips
            );


        /* Vault selector */

        $("vaultTripSelect")
            .addEventListener(
                "change",
                event => {

                    state.currentVaultTripId =
                        event.target.value;

                    renderVault();
                }
            );


        /* Itinerary selector */

        $("itineraryTripSelect")
            .addEventListener(
                "change",
                event => {

                    state.currentItineraryTripId =
                        event.target.value;

                    renderItinerary();
                }
            );


        /* Close buttons */

        $$("[data-close]").forEach(button => {

            button.addEventListener(
                "click",
                () => {
                    closeModal(
                        button.dataset.close
                    );
                }
            );

        });


        /* Close modal when clicking background */

        $$(".modal-overlay").forEach(overlay => {

            overlay.addEventListener(
                "click",
                event => {

                    if (
                        event.target === overlay
                    ) {
                        overlay.classList.remove("show");
                    }
                }
            );

        });


        /* ESC closes modal */

        document.addEventListener(
            "keydown",
            event => {

                if (event.key === "Escape") {

                    $$(".modal-overlay.show")
                        .forEach(modal => {
                            modal.classList.remove("show");
                        });
                }
            }
        );


        /* Refresh */

        $("refreshBtn")
            .addEventListener(
                "click",
                () => loadTrips(true)
            );


        /* Trip card actions */

        $("dashboardTrips")
            .addEventListener(
                "click",
                handleTripAction
            );

        $("allTrips")
            .addEventListener(
                "click",
                handleTripAction
            );


        /* Expense delete */

        $("vaultContent")
            .addEventListener(
                "click",
                event => {

                    const button =
                        event.target.closest(
                            "[data-expense-delete]"
                        );

                    if (!button) {
                        return;
                    }

                    deleteExpense(
                        button.dataset.expenseDelete
                    );
                }
            );


        /* Plan delete */

        $("itineraryContent")
            .addEventListener(
                "click",
                event => {

                    const button =
                        event.target.closest(
                            "[data-plan-delete]"
                        );

                    if (!button) {
                        return;
                    }

                    deletePlan(
                        button.dataset.planDelete
                    );
                }
            );


        /* Initial members */

        renderMemberFields();


        /* Initial database load */

        loadTrips(true);


        /*
           Automatic synchronization.
           Every 3 seconds the app checks Firebase
           for changes made by another device.
        */

        state.syncTimer =
            setInterval(
                () => loadTrips(false),
                3000
            );

    }
);


/* =========================================================
   TRIP ACTION HANDLER
========================================================= */

async function handleTripAction(event) {

    const button =
        event.target.closest(
            "[data-action]"
        );

    if (!button) {
        return;
    }

    const action =
        button.dataset.action;

    const tripId =
        button.dataset.id;

    const trip =
        getTrip(tripId);

    if (!trip) {
        return;
    }

    if (action === "vault") {

        state.currentVaultTripId =
            tripId;

        $("vaultTripSelect").value =
            tripId;

        showView("vault");

        renderVault();

        return;
    }


    if (action === "itinerary") {

        state.currentItineraryTripId =
            tripId;

        $("itineraryTripSelect").value =
            tripId;

        showView("itinerary");

        renderItinerary();

        return;
    }


    if (action === "delete") {

        const confirmed =
            confirm(
                `Delete "${trip.name}"?\n\nThis will permanently remove the trip and its expenses from Firebase.`
            );

        if (!confirmed) {
            return;
        }

        try {

            await removeTrip(tripId);

            showToast(
                "Trip deleted from Firebase",
                "success"
            );

        } catch (error) {

            console.error(error);

            showToast(
                "Could not delete trip: " +
                error.message,
                "error"
            );
        }
    }
}


/* =========================================================
   STARTUP CONNECTION TEST
========================================================= */

window.addEventListener(
    "online",
    () => {
        loadTrips(false);
    }
);

window.addEventListener(
    "offline",
    () => {
        setDatabaseStatus(false);
    }
);