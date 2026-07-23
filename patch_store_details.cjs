const fs = require('fs');
let content = fs.readFileSync('src/components/StoreDetailsPage.tsx', 'utf8');

if (!content.includes('useUrlDateRange')) {
  content = content.replace('import { useNavigate, useParams } from "react-router-dom";', 'import { useNavigate, useParams, useSearchParams } from "react-router-dom";\nimport { useUrlDateRange } from "../hooks/useUrlDateRange";');
}

content = content.replace(
  'const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 6));\n  const [endDate, setEndDate] = useState<Date>(new Date());',
  'const { startDate, endDate, setStartDate, setEndDate } = useUrlDateRange(6);'
);

fs.writeFileSync('src/components/StoreDetailsPage.tsx', content);
