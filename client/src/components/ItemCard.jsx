import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import { formatRs, resolveImageUrl } from "../utils/format.js";

// Card for priced catalog items (packages, food, decorations, services):
// optional cover photo, category, name, description, optional included
// items, and a footer with the price and a details link when one exists.
// Items without photos keep the compact icon layout.
const ItemCard = ({ item, icon, to, priceNote, includes }) => {
  const cover = item.images?.[0];
  const Media = to ? Link : "div";
  return (
    <article className="card item-card">
      {cover && (
        <Media {...(to && { to, tabIndex: -1, "aria-label": `View ${item.name}` })} className="card-media">
          <img src={resolveImageUrl(cover)} alt="" loading="lazy" />
          {item.images.length > 1 && (
            <span className="media-count">
              <Icon name="camera" size={13} /> {item.images.length}
            </span>
          )}
        </Media>
      )}
      <div className="card-body">
        <div className="item-card-top">
          {!cover && (
            <span className="item-icon" aria-hidden="true">
              <Icon name={icon} size={20} />
            </span>
          )}
          {item.category && <span className="eyebrow">{item.category}</span>}
        </div>
        <h3 className="card-title">{to ? <Link to={to}>{item.name}</Link> : item.name}</h3>
        {item.description && <p className="card-text clamp-3">{item.description}</p>}
        {includes?.length > 0 && (
          <ul className="check-list">
            {includes.slice(0, 4).map((entry) => (
              <li key={entry}>
                <Icon name="check" size={14} /> {entry}
              </li>
            ))}
            {includes.length > 4 && <li className="muted">+{includes.length - 4} more</li>}
          </ul>
        )}
      </div>
      <div className="card-footer">
        <span className="price-block">
          <span className="price">{formatRs(item.price)}</span>
          {priceNote && <span className="muted small">{priceNote}</span>}
        </span>
        {to && (
          <Link to={to} className="button-link button-sm">
            Details
          </Link>
        )}
      </div>
    </article>
  );
};

export default ItemCard;
