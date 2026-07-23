const fs = require('fs');
let content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// Add import
if (!content.includes('useUrlDateRange')) {
  content = content.replace('import { useNavigate, useLocation } from "react-router-dom";', 'import { useNavigate, useLocation, useSearchParams } from "react-router-dom";\nimport { useUrlDateRange } from "../hooks/useUrlDateRange";');
}

// Replace in Dashboard
content = content.replace(
  'const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 6));\n  const [endDate, setEndDate] = useState<Date>(new Date());',
  'const { startDate, endDate, setStartDate, setEndDate } = useUrlDateRange(6);'
);

// Replace in CategoryDashboard
content = content.replace(
  'const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 6));\n  const [endDate, setEndDate] = useState<Date>(new Date());',
  'const { startDate, endDate, setStartDate, setEndDate } = useUrlDateRange(6);'
);

fs.writeFileSync('src/components/Dashboard.tsx', content);
