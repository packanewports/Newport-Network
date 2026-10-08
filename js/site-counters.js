const countersTable = "site_counters";
const counterElements = {
  clicks: document.querySelector("#community-counter"),
  visits: document.querySelector("#site-visit-counter"),
};
const counterButton = document.querySelector("#community-counter-button");
const counterStatus = document.querySelector("#site-counters-status");
const isHomePage = Boolean(counterElements.clicks && counterElements.visits);

let counterChannel;
let currentCounts = { clicks: 0, visits: 0 };
const counterOdometers = {};
let countersFailedToLoad = false;

function formatCounterValue(value) {
  return new Intl.NumberFormat().format(value);
}

function initializeCounterOdometers() {
  if (typeof window.Odometer !== "function") {
    console.error("Odometer did not load; counters will display without flip animation.");
    return;
  }

  for (const [kind, element] of Object.entries(counterElements)) {
    if (!element) continue;
    counterOdometers[kind] = new window.Odometer({
      el: element,
      value: Number(element.textContent) || 0,
      format: "(,ddd)",
      theme: "default",
    });
  }
}

function renderCounter(kind, value) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`The ${kind} counter returned an invalid value.`);
  }
  const next = Math.max(currentCounts[kind], normalized);
  currentCounts[kind] = next;
  const element = counterElements[kind];
  if (!element) return;
  element.setAttribute("aria-label", formatCounterValue(next));
  if (counterOdometers[kind]) {
    counterOdometers[kind].update(next);
  } else {
    element.textContent = formatCounterValue(next);
  }
}

async function loadCounters(supabase) {
  const { data, error } = await supabase
    .from(countersTable)
    .select("click_count, visit_count")
    .eq("id", true)
    .single();
  if (error) {
    throw error;
  }
  renderCounter("clicks", data.click_count);
  renderCounter("visits", data.visit_count);
}

async function incrementCounter(supabase, kind) {
  const { data, error } = await supabase.rpc("increment_site_counter", {
    p_counter: kind,
  });
  if (error) {
    throw error;
  }
  const count = Number(data);
  renderCounter(kind, count);
}

async function initializeSiteCounters() {
  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error("Unable to initialize site counters: Supabase client is unavailable.");
    if (isHomePage) {
      counterStatus.textContent = "Live counters are unavailable right now.";
      counterButton.disabled = true;
    }
    return;
  }

  if (counterButton) {
    counterButton.disabled = false;
    counterButton.addEventListener("click", async () => {
      counterButton.disabled = true;
      counterStatus.textContent = "Adding your click...";
      try {
        await incrementCounter(supabase, "clicks");
        counterStatus.textContent = "Your click joined the live total!";
      } catch (error) {
        counterStatus.textContent = "Could not update the counter. Please try again.";
        console.error("Unable to increment the community counter:", error);
      } finally {
        counterButton.disabled = false;
      }
    });
  }

  if (isHomePage) {
    try {
      await loadCounters(supabase);
    } catch (error) {
      countersFailedToLoad = true;
      counterStatus.textContent = "Could not load the live counters. Run the latest supabase-setup.sql.";
      console.error("Unable to load site counters:", error);
    }

    counterChannel = supabase
      .channel("newport-site-counters")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: countersTable }, ({ new: counts }) => {
        renderCounter("clicks", counts.click_count);
        renderCounter("visits", counts.visit_count);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          counterStatus.textContent = countersFailedToLoad
            ? "Live updates are connected, but the counters could not be loaded."
            : "Live counters are connected.";
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          counterStatus.textContent = countersFailedToLoad
            ? "Could not load counters; live updates are disconnected."
            : "Live updates disconnected. Reconnecting...";
        }
      });
  }

  try {
    await incrementCounter(supabase, "visits");
  } catch (error) {
    if (isHomePage) {
      counterStatus.textContent = "Could not count this visit. Run the latest supabase-setup.sql.";
    }
    console.error("Unable to increment the visit counter:", error);
  }
}

window.addEventListener("pagehide", () => {
  if (counterChannel && window.supabaseClient) {
    window.supabaseClient.removeChannel(counterChannel);
  }
});

initializeCounterOdometers();
initializeSiteCounters();
