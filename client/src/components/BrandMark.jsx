import { Link } from "react-router-dom";
import { usePublicSettings } from "../hooks/usePublicSettings.js";
import { resolveImageUrl } from "../utils/format.js";

// The restaurant's logo (or the first letter of its name when there is no
// logo) and name, linking home. Used by the header and footer. The name is
// held back until the settings have loaded so the default never flashes.
const BrandMark = () => {
  const { loaded, businessName, logoUrl } = usePublicSettings();
  return (
    <Link to="/" className="brand" aria-label={loaded ? `${businessName} — home` : "Home"}>
      {logoUrl ? (
        <img className="brand-logo" src={resolveImageUrl(logoUrl)} alt="" />
      ) : (
        <span className="brand-mark" aria-hidden="true">
          {loaded ? businessName.charAt(0) : ""}
        </span>
      )}
      <span className={`brand-name ${loaded ? "" : "is-loading"}`}>{loaded ? businessName : " "}</span>
    </Link>
  );
};

export default BrandMark;
