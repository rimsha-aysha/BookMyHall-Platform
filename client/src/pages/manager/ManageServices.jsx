import ManagerCatalogManager from "../../components/ManagerCatalogManager.jsx";
import { servicesApi } from "../../api/catalogApi.js";

const fields = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "price", label: "Price", type: "number", required: true },
  { name: "category", label: "Category", type: "text" },
  { name: "images", label: "Photos", type: "images" },
];

const ManageServices = () => (
  <ManagerCatalogManager title="Manage Additional Services" api={servicesApi} fields={fields} />
);

export default ManageServices;
