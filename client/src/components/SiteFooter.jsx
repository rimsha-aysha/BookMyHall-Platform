import { Link } from "react-router-dom";
import { usePublicSettings } from "../hooks/usePublicSettings.js";
import BrandMark from "./BrandMark.jsx";
import Icon from "./Icon.jsx";

// Contact details and policies come from the Owner's Restaurant Settings.
const SiteFooter = () => {
  const {
    loaded,
    businessName,
    tagline,
    contactEmail,
    contactPhone,
    whatsapp,
    address,
    mapUrl,
    policyNotes,
    cancellationPolicy,
  } = usePublicSettings();
  const hasContact = address || contactPhone || contactEmail || whatsapp || mapUrl;

  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div className="footer-brand">
          <BrandMark />
          {tagline && <p className="muted mt-8">{tagline}</p>}
        </div>

        <div className="footer-col footer-links">
          <h4>Explore</h4>
          <Link to="/halls">Halls</Link>
          <Link to="/packages">Packages</Link>
          <Link to="/food">Food</Link>
          <Link to="/gallery">Past events</Link>
        </div>

        <div className="footer-col">
          <h4>Contact</h4>
          {loaded && !hasContact && <p className="muted">Contact details coming soon.</p>}
          {address && (
            <p>
              <Icon name="pin" size={16} /> {address}
            </p>
          )}
          {mapUrl && (
            <p>
              <Icon name="pin" size={16} />{" "}
              <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                View on map
              </a>
            </p>
          )}
          {contactPhone && (
            <p>
              <Icon name="phone" size={16} /> <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>{contactPhone}</a>
            </p>
          )}
          {whatsapp && (
            <p>
              <Icon name="message" size={16} />{" "}
              <a href={`https://wa.me/91${whatsapp}`} target="_blank" rel="noopener noreferrer">
                WhatsApp {whatsapp}
              </a>
            </p>
          )}
          {contactEmail && (
            <p>
              <Icon name="mail" size={16} /> <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </p>
          )}
        </div>
      </div>
      <div className="container footer-bottom">
        {(policyNotes || cancellationPolicy) && (
          <details>
            <summary>Booking &amp; cancellation policies</summary>
            {policyNotes && (
              <p className="muted mt-8" style={{ whiteSpace: "pre-line" }}>
                {policyNotes}
              </p>
            )}
            {cancellationPolicy && (
              <>
                <h5 className="mt-8">Cancellation</h5>
                <p className="muted" style={{ whiteSpace: "pre-line" }}>
                  {cancellationPolicy}
                </p>
              </>
            )}
          </details>
        )}
        {loaded && (
          <span>
            © {new Date().getFullYear()} {businessName}
          </span>
        )}
      </div>
    </footer>
  );
};

export default SiteFooter;
