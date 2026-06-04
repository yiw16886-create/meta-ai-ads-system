import axios from "axios"; axios.get("http://localhost:3000/api/stores/all-dashboard-summary").then(r => console.log(r.status)).catch(e => console.error(e.response?.status, e.message))
