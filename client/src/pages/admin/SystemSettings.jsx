import { useState } from "react";
import { useFetch } from "../../hooks/useFetch.js";
import { settingsApi } from "../../api/settingsApi.js";
import { refreshPublicSettings } from "../../hooks/usePublicSettings.js";
import PageHeader from "../../components/PageHeader.jsx";
import ImageListEditor from "../../components/ImageListEditor.jsx";
import Icon from "../../components/Icon.jsx";
import { ErrorState } from "../../components/States.jsx";
import { apiError } from "../../utils/format.js";
import { DEFAULT_ACCENT, isHexColor, readableAccent, textOn } from "../../utils/color.js";

// Owner-only restaurant settings. One installation serves one restaurant, so
// these are simply "the restaurant's" details — shown across the customer
// site and staff pages — plus the booking rules the server enforces.

const MAX_EVENT_TYPES = 30;
const MAX_EVENT_TYPE_LENGTH = 50;
const DEFAULT_HOURS = { openingTime: "10:00", closingTime: "23:00" };

const toForm = (s) => ({
  businessName: s.businessName || "",
  tagline: s.tagline || "",
  description: s.description || "",
  logoUrl: s.logoUrl || "",
  coverImages: [...(s.coverImages || [])],
  brandColor: s.brandColor || "",
  contactEmail: s.contactEmail || "",
  contactPhone: s.contactPhone || "",
  whatsapp: s.whatsapp || "",
  address: s.address || "",
  mapUrl: s.mapUrl || "",
  policyNotes: s.policyNotes || "",
  cancellationPolicy: s.cancellationPolicy || "",
  advancePaymentPercentage: s.advancePaymentPercentage ?? 50,
  eventTypes: [...(s.eventTypes || [])],
  limitHours: Boolean(s.openingTime && s.closingTime),
  openingTime: s.openingTime || DEFAULT_HOURS.openingTime,
  closingTime: s.closingTime || DEFAULT_HOURS.closingTime,
  minNoticeDays: s.minNoticeDays ?? 0,
  maxAdvanceDays: s.maxAdvanceDays ?? "",
});

const toPayload = (form) => {
  const { limitHours, ...rest } = form;
  return {
    ...rest,
    openingTime: limitHours ? form.openingTime : "",
    closingTime: limitHours ? form.closingTime : "",
    advancePaymentPercentage: Number(form.advancePaymentPercentage),
    minNoticeDays: Number(form.minNoticeDays),
    maxAdvanceDays: form.maxAdvanceDays === "" ? null : Number(form.maxAdvanceDays),
  };
};

// "coverImages[2]" -> "coverImages", so array errors land on their field.
const fieldOf = (path) => String(path || "").replace(/\[\d+\]$/, "");

const FieldError = ({ errors, name }) =>
  errors[name] ? (
    <p className="field-error" role="alert">
      {errors[name]}
    </p>
  ) : null;

const TextField = ({ form, setField, errors, name, label, type = "text", help, ...props }) => (
  <div>
    <label htmlFor={name}>{label}</label>
    {type === "textarea" ? (
      <textarea id={name} value={form[name]} onChange={(e) => setField(name, e.target.value)} {...props} />
    ) : (
      <input id={name} type={type} value={form[name]} onChange={(e) => setField(name, e.target.value)} {...props} />
    )}
    {help && <p className="field-help">{help}</p>}
    <FieldError errors={errors} name={name} />
  </div>
);

const EventTypesEditor = ({ value, onChange }) => {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const add = () => {
    const type = draft.trim();
    setError("");
    if (!type) return;
    if (value.some((t) => t.toLowerCase() === type.toLowerCase())) {
      setError(`"${type}" is already in the list`);
      return;
    }
    if (value.length >= MAX_EVENT_TYPES) {
      setError(`At most ${MAX_EVENT_TYPES} event types`);
      return;
    }
    onChange([...value, type]);
    setDraft("");
  };

  return (
    <div className="event-types-editor">
      <ul className="chips" aria-label="Event types">
        {value.map((type) => (
          <li key={type} className="chip">
            {type}
            <button
              type="button"
              className="chip-remove"
              onClick={() => onChange(value.filter((t) => t !== type))}
              aria-label={`Remove ${type}`}
              title="Remove"
            >
              <Icon name="x" size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="inline-field">
        <input
          id="eventTypes"
          value={draft}
          maxLength={MAX_EVENT_TYPE_LENGTH}
          placeholder="Add an event type, e.g. Reception"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches;

const AccentColorField = ({ value, onChange, error }) => {
  const color = isHexColor(value) ? value : DEFAULT_ACCENT;
  // Preview exactly what the site will use in the current colour scheme
  // (useSiteBranding adjusts the colour where needed to stay readable).
  const shown = readableAccent(color, prefersDark() ? "dark" : "light");
  return (
    <div>
      <label htmlFor="brandColor">Accent colour</label>
      <div className="color-field">
        <input id="brandColor" type="color" value={color} onChange={(e) => onChange(e.target.value)} />
        <code>{value ? color : `${DEFAULT_ACCENT} (default)`}</code>
        {value && (
          <button type="button" className="button-sm" onClick={() => onChange("")}>
            Use default
          </button>
        )}
      </div>
      <div className="color-preview">
        <span className="color-preview-button" style={{ background: shown, color: textOn(shown) }}>
          Book an event
        </span>
        <span style={{ color: shown }}>A link in this colour</span>
      </div>
      <p className="field-help">Used for buttons, links and highlights on the customer site and staff pages.</p>
      {shown.toLowerCase() !== color.toLowerCase() && (
        <p className="field-help">
          To keep text readable, this colour is shown slightly {prefersDark() ? "lighter" : "darker"} in the current{" "}
          {prefersDark() ? "dark" : "light"} theme (as previewed).
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

const SettingsForm = ({ initial }) => {
  const [form, setForm] = useState(() => toForm(initial));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setSuccess(false);
  };
  const fieldProps = { form, setField, errors: fieldErrors };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setFieldErrors({});
    setSuccess(false);
    if (form.eventTypes.length === 0) {
      setFieldErrors({ eventTypes: "Add at least one event type" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await settingsApi.update(toPayload(form));
      setForm(toForm(res.data.data));
      refreshPublicSettings();
      setSuccess(true);
    } catch (err) {
      const errors = err?.response?.data?.errors;
      if (errors?.length) {
        setFieldErrors(Object.fromEntries(errors.map((x) => [fieldOf(x.field), x.message])));
        setFormError("Please correct the highlighted fields.");
        // Bring the first problem into view — it may be far above the save bar.
        requestAnimationFrame(() => {
          const field = document.getElementById(fieldOf(errors[0].field));
          field?.closest("div")?.scrollIntoView({ block: "center", behavior: "smooth" });
          field?.focus({ preventScroll: true });
        });
      } else {
        setFormError(apiError(err, "Could not save settings"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="settings-form">
      <section className="form-card wide-form">
        <h2>Restaurant profile</h2>
        <p className="muted small">Shown in the header, footer and home page of your customer site.</p>
        <TextField {...fieldProps} name="businessName" label="Restaurant name" required maxLength={100} />
        <TextField {...fieldProps} name="tagline" label="Tagline" maxLength={160} help="One short line, e.g. “Celebrations since 1998”." />
        <TextField
          {...fieldProps}
          name="description"
          label="About the restaurant"
          type="textarea"
          maxLength={2000}
          help="A few sentences for the home page."
        />
      </section>

      <section className="form-card wide-form">
        <h2>Branding</h2>
        <div>
          <label htmlFor="logoUrl">Logo</label>
          <ImageListEditor
            id="logoUrl"
            value={form.logoUrl ? [form.logoUrl] : []}
            onChange={(images) => setField("logoUrl", images[0] || "")}
            max={1}
            ordered={false}
          />
          <p className="field-help">A square image works best. Without a logo, the first letter of the name is shown.</p>
          <FieldError errors={fieldErrors} name="logoUrl" />
        </div>
        <div>
          <label htmlFor="coverImages">Cover photos</label>
          <ImageListEditor
            id="coverImages"
            value={form.coverImages}
            onChange={(images) => setField("coverImages", images)}
            max={10}
          />
          <p className="field-help">The cover photo leads the home page. Without one, the first hall photo is used.</p>
          <FieldError errors={fieldErrors} name="coverImages" />
        </div>
        <AccentColorField value={form.brandColor} onChange={(v) => setField("brandColor", v)} error={fieldErrors.brandColor} />
      </section>

      <section className="form-card wide-form">
        <h2>Contact</h2>
        <div className="form-row">
          <TextField {...fieldProps} name="contactPhone" label="Phone" type="tel" maxLength={30} />
          <TextField
            {...fieldProps}
            name="whatsapp"
            label="WhatsApp number"
            type="tel"
            maxLength={16}
            help="10-digit Indian mobile number."
          />
        </div>
        <TextField {...fieldProps} name="contactEmail" label="Email" type="email" />
        <TextField {...fieldProps} name="address" label="Address" maxLength={300} />
        <TextField
          {...fieldProps}
          name="mapUrl"
          label="Map link"
          type="url"
          placeholder="https://maps.google.com/…"
          help="Paste the “Share” link from Google Maps."
        />
      </section>

      <section className="form-card wide-form">
        <h2>Booking rules</h2>
        <p className="muted small">
          Customers' online bookings must follow these rules. Staff entering a walk-in booking can override the notice
          period and opening hours when needed — never hall availability.
        </p>

        <div>
          <label htmlFor="eventTypes">Event types</label>
          <EventTypesEditor value={form.eventTypes} onChange={(types) => setField("eventTypes", types)} />
          <p className="field-help">
            Keep “Other” in the list to let customers describe their own event; remove it to allow only these types.
          </p>
          <FieldError errors={fieldErrors} name="eventTypes" />
        </div>

        <div>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={form.limitHours}
              onChange={(e) => setField("limitHours", e.target.checked)}
            />
            Limit bookings to opening hours
          </label>
          {form.limitHours && (
            <div className="form-row mt-8">
              <TextField {...fieldProps} name="openingTime" label="Opening time" type="time" required />
              <TextField {...fieldProps} name="closingTime" label="Closing time" type="time" required />
            </div>
          )}
          {!form.limitHours && <p className="field-help">Events can be booked at any time of day.</p>}
        </div>

        <div className="form-row">
          <TextField
            {...fieldProps}
            name="minNoticeDays"
            label="Minimum notice (days)"
            type="number"
            min={0}
            max={365}
            help="0 allows same-day bookings."
          />
          <TextField
            {...fieldProps}
            name="maxAdvanceDays"
            label="Book at most (days ahead)"
            type="number"
            min={1}
            max={1095}
            placeholder="No limit"
            help="Leave empty for no limit."
          />
          <TextField
            {...fieldProps}
            name="advancePaymentPercentage"
            label="Advance payment (%)"
            type="number"
            min={1}
            max={100}
            required
            help="Paid after approval to confirm a booking."
          />
        </div>
      </section>

      <section className="form-card wide-form">
        <h2>Policies</h2>
        <TextField
          {...fieldProps}
          name="policyNotes"
          label="Booking policies"
          type="textarea"
          maxLength={3000}
          help="Shown on the booking page and in the footer."
        />
        <TextField
          {...fieldProps}
          name="cancellationPolicy"
          label="Cancellation policy"
          type="textarea"
          maxLength={3000}
          help="Shown to customers before they book."
        />
      </section>

      <div className="settings-actions">
        {formError && <p role="alert">{formError}</p>}
        {success && (
          <p className="alert-success" role="status">
            Settings saved.
          </p>
        )}
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
};

const SystemSettings = () => {
  const { data: settings, loading, error, reload } = useFetch(settingsApi.get);

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Restaurant settings"
        lead="Your restaurant's details, branding, contact information and booking rules."
      />
      {loading && <div className="card skeleton" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && settings && <SettingsForm key={settings.updatedAt || "new"} initial={settings} />}
    </div>
  );
};

export default SystemSettings;
