# Veave CMS AI Component Definition Guide

This document is designed to be fed into LLM coding assistants (like Cursor, Claude, ChatGPT, or Gemini) to teach them how to correctly generate layout components, templates, and raw HTML uploads that are fully compliant with the Veave CMS architecture.

## 1. Core Architecture
- **Everything is a component.** Veave CMS splits page rendering from raw HTML. A "Page" simply mounts one or more "Components" visually.
- **Bulk Importer Engine:** The CMS has an automated "Bulk ZIP Importer". If an AI generates a ZIP of HTML templates, the CMS determines what they are based on the file name.

### File Naming Convention (For Bulk Import)
- `index.html`, `about.html`, `contact.html`: Picked up as **Whole Pages**. The CMS will auto-generate a wrapper component, mount it, and generate a frontend route (e.g. `/about`).
- `/components/hero.html`, `navbar.part.html`: Picked up strictly as **Reusable Components** available in the builder.

## 2. Nunjucks Templating
Veave CMS uses the **Nunjucks** templating language. Variables are provided via JSON and rendered using double braces `{{ }}`.

```html
<!-- Correct -->
<h1>{{ title }}</h1>

<!-- Incorrect -->
<h1>${title}</h1>
```

## 3. Inline Editing (The Golden Rule)
For the visual builder to allow end-users to edit text, you **MUST** attach specific data attributes to editable HTML nodes.

To map a Nunjucks variable `{{ title }}` to the visual editor:
1. Add `class="editable"`.
2. Add `data-field="[variable_name]"`.

**Example Implementation:**
```html
<section class="hero-section">
    <div class="container">
        <!-- Text fields -->
        <h1 class="editable" data-field="title">{{ title }}</h1>
        <p class="editable" data-field="subtitle">{{ subtitle }}</p>
        
        <!-- Conditionals & Link fields -->
        {% if button_text %}
        <a href="{{ button_url }}" class="editable btn" data-field="button_text">{{ button_text }}</a>
        {% endif %}
    </div>
</section>
```

### Supported Data Bindings:
- **Text/Headings**: Use `data-field` mapping directly on the `<h1>`, `<p>`, or `<span>`.
- **Links**: Map `data-field` to the inner text of the `<a>` tag.
- **Images**: Do not use `class="editable"` for images yet; rely on the backend static JSON configuration for `src` attributes.

## 4. Component Scoped Styling
Veave CMS does not enforce Tailwind by default. The best practice for writing components is to include specific, namespaced `<style>` blocks at the bottom of the component file, or utilize inline styles for structure.

```html
<section class="pricing-card">
    <h2 class="editable" data-field="tier">{{ tier }}</h2>
</section>

<style>
/* Always namespace CSS to avoid global leaks */
.pricing-card {
    background: #ffffff;
    border-radius: 12px;
}
.pricing-card h2 {
    color: #1e293b;
}
</style>
```

## 5. Summary Rule for AI Agents
When prompted to "Create a Pricing Component for Veave CMS":
1. Write raw HTML using namespaced Vanilla CSS structure.
2. Abstract the text nodes into Nunjucks `{{ param }}` identifiers.
3. Attach `class="editable" data-field="param"` to those nodes.
4. Name the file `pricing.part.html` to ensure the ZIP Importer flags it as a component snippet.
