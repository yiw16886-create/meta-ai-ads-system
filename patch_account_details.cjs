const fs = require('fs');
let content = fs.readFileSync('src/components/AccountDetailsPage.tsx', 'utf8');

if (!content.includes('useUrlDateRange')) {
  content = content.replace('import { useParams, useNavigate } from "react-router-dom";', 'import { useParams, useNavigate, useSearchParams } from "react-router-dom";\nimport { useUrlDateRange } from "../hooks/useUrlDateRange";');
}

content = content.replace(
  'const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 6));\n  const [endDate, setEndDate] = useState<Date>(new Date());\n  const [tempDateRange, setTempDateRange] = useState<{ from: Date; to?: Date }>({ from: subDays(new Date(), 6), to: new Date() });',
  'const { startDate, endDate, setStartDate, setEndDate } = useUrlDateRange(6);\n  const [tempDateRange, setTempDateRange] = useState<{ from: Date; to?: Date }>({ from: startDate, to: endDate });'
);

fs.writeFileSync('src/components/AccountDetailsPage.tsx', content);
