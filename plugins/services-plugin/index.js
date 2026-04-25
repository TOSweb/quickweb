// plugins/services-plugin/index.js
export async function register({ getDB, addContentType, addTag }) {
  const db = getDB();

  // Create the table on first run (safe to call on every restart)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      title   TEXT NOT NULL,
      summary TEXT,
      icon    TEXT,
      price   TEXT,
      link    TEXT,
      status  TEXT NOT NULL DEFAULT 'published',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Register the admin panel content type
  addContentType({
    slug: "services",
    label: "Services",
    singular: "Service",
    table: "services",
    titleField: "title",
    sortField: "sort_order",
    sortDir: "ASC",
    // navIcon: optional SVG path string to override the default grid icon
    fields: [
      {
        name: "title",
        label: "Service Name",
        type: "text",
        required: true,
        placeholder: "e.g. Web Design",
      },
      {
        name: "summary",
        label: "Short Description",
        type: "rich",
        rows: 3,
        placeholder: "One or two sentences shown on the services page",
      },
      {
        name: "icon",
        label: "Icon (emoji or URL)",
        type: "text",
        placeholder: "🎨 or /uploads/icon.svg",
        help: "Emoji or a URL to an image file",
      },
      {
        name: "price",
        label: "Price / Starting From",
        type: "text",
        placeholder: "e.g. From $500",
      },
      {
        name: "link",
        label: "Learn More URL",
        type: "url",
        placeholder: "https://example.com/services/web-design",
      },
      {
        name: "sort_order",
        label: "Sort Order",
        type: "number",
        default: 0,
        list: false,   // hide this column in the list view
        help: "Lower numbers appear first",
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: ["published", "draft"],
        default: "published",
      },
    ],
  });

  // Optional: register a template tag so themes can render services inline
  // Usage in a Nunjucks template or dynamic component: {% services limit=3 %}
  addTag("services", async ({ limit = 10 } = {}) => {
    const items = await db.all(
      `SELECT * FROM services WHERE status='published' ORDER BY sort_order ASC LIMIT ?`,
      [parseInt(limit)]
    );
    if (!items.length) return "";
    return items.map(s => `
      <div class="service-card">
        ${s.icon ? `<div class="service-icon">${s.icon}</div>` : ""}
        <h3>${s.title}</h3>
        ${s.summary ? `<p>${s.summary}</p>` : ""}
        ${s.price ? `<div class="service-price">${s.price}</div>` : ""}
        ${s.link ? `<a href="${s.link}" class="service-link">Learn more →</a>` : ""}
      </div>
    `).join("");
  });
}
