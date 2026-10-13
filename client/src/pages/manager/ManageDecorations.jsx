import ManagerCatalogManager from "../../components/ManagerCatalogManager.jsx";
import { decorationsApi } from "../../api/catalogApi.js";

const fields = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "price", label: "Price", type: "number", required: true },
  { name: "category", label: "Category / Theme", type: "text" },
  { name: "images", label: "Photos", type: "images" },
];

const ManageDecorations = () => (
  <ManagerCatalogManager title="Manage Decorations" api={decorationsApi} fields={fields} />
);

export default ManageDecorations;
