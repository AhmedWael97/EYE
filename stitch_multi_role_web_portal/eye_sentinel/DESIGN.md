# Design System Specification: The Observational Lens

## 1. Overview & Creative North Star: "The Digital Curator"
This design system is built for 'EYE', an AI visitor tracking platform that transforms raw data into actionable intelligence. The "Creative North Star" for this system is **The Digital Curator**. 

In an era of dashboard fatigue, we move beyond "standard SaaS" by treating data with editorial authority. We reject the rigid, boxed-in layouts of legacy platforms in favor of **Organic Precision**. The UI should feel like a high-end architectural space—open, layered, and sophisticated. We achieve this through intentional asymmetry, where large typographic headers create a focal point, and data visualizations are allowed to "breathe" with generous white space. We don't just show data; we curate the user's focus.

---

## 2. Colors: Tonal Depth & The "No-Line" Rule
The palette utilizes a sophisticated range of Indigos and Violets, anchored by deep Slate Grays. We do not use color merely for decoration; we use it to define the environment.

### The Palette (Dark Mode Base)
- **Primary:** `primary` (#c0c1ff) — Used for high-emphasis actions and "active" states.
- **Secondary:** `secondary` (#d0bcff) — Supporting accents and tonal shifts.
- **Surface:** `surface` (#0b1326) — The canvas of the application.

### The "No-Line" Rule
**Explicit Instruction:** Traditional 1px solid borders are strictly prohibited for sectioning. We define boundaries through **Background Color Shifts**. 
- To separate a sidebar from a main content area, use `surface_container_low` against `surface`.
- To highlight a featured metric, nest a `surface_container_highest` element within a `surface_container` area.

### Glass & Gradient Signature
To provide "soul" to the data, use the **Signature Glow**:
- **CTAs:** Apply a subtle linear gradient from `primary` (#c0c1ff) to `primary_container` (#8083ff).
- **Floating Elements:** Use Glassmorphism. Apply `surface_variant` at 60% opacity with a `20px` backdrop-blur. This ensures the UI feels like layered glass rather than flat plastic.

---

## 3. Typography: Editorial Authority
We utilize **Inter** (Latin) and **Tajawal** (Arabic) to create a hierarchy that feels both technical and premium.

- **Display (Large/Medium):** Reserved for high-level insights. Use `display-lg` (3.5rem) with a negative letter-spacing of `-0.02em` to create a "compact" high-fashion feel.
- **Headlines:** `headline-md` (1.75rem) should be used for section titles. Pair these with asymmetrical layouts (e.g., left-aligned text with a right-aligned metric) to break the grid.
- **Body:** `body-md` (0.875rem) is our workhorse. It ensures readability in dense data environments.
- **Labels:** `label-sm` (0.6875rem) must always be in All Caps with `0.05em` letter-spacing when used for metadata or table headers to maintain a "technical ledger" aesthetic.

---

## 4. Elevation & Depth: Tonal Layering
Depth is achieved through physics-based stacking, not artificial outlines.

- **The Layering Principle:** 
    1. Base: `surface` (#0b1326)
    2. Sectioning: `surface_container_low` (#131b2e)
    3. Cards/Modules: `surface_container` (#171f33)
    4. Active/Pop-over: `surface_container_highest` (#2d3449)

- **Ambient Shadows:** For floating modals or dropdowns, use a "Tinted Shadow." 
    - *Value:* `0px 20px 40px rgba(7, 0, 108, 0.2)`
    - This uses the `on_primary_fixed` color as a shadow base, making the shadow feel like a natural light refraction from the indigo UI.

- **The Ghost Border Fallback:** If high-contrast accessibility is required, use a "Ghost Border": `outline_variant` at **15% opacity**. Never use a 100% opaque border.

---

## 5. Components: Precision Primitives

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`), `8px` (DEFAULT) radius. No border.
- **Tertiary:** Text only using `primary` color. On hover, apply a `surface_bright` background shift.

### Input Fields
- **Style:** Background set to `surface_container_lowest`. 
- **States:** On focus, the background shifts to `surface_container_high`. Use a `2px` glow of `primary` instead of a harsh border.

### Cards & Data Lists
- **The Divider Ban:** Cards must never use divider lines. Separate content using `1.5rem` (xl) vertical spacing or by nesting a `surface_container_low` area within the card for the footer.
- **Metric Cards:** Use `display-sm` for the primary number, paired with a `tertiary` (#ffb783) sparkline to indicate AI-driven trends.

### The "Insight" Chip
A custom component for AI platform 'EYE'. 
- **Style:** Semi-transparent `secondary_container` background with a `secondary` text color. Used to flag AI-detected anomalies in visitor behavior.

---

## 6. Do’s and Don’ts

### Do
- **Do** use white space as a structural element. If an interface feels "busy," increase the padding rather than adding a border.
- **Do** overlap elements. Let a chart slightly bleed over the edge of its container to create a sense of depth and motion.
- **Do** use `tertiary` (#ffb783) sparingly as a "Warning" or "High Interest" color to break the indigo/violet monotony.

### Don't
- **Don't** use pure black (#000000) or pure white (#FFFFFF). Always use the themed surface and on-surface tokens.
- **Don't** use standard 4px corners. Stick strictly to the `8px` (DEFAULT) and `16px` (xl) scale to maintain the system's "soft-modern" DNA.
- **Don't** align everything to a center axis. Use "Editorial Offsets"—pushing sub-text to the far right or left—to create a high-fidelity, custom-built appearance.