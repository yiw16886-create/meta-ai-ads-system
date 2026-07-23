const fs = require('fs');
let content = fs.readFileSync('src/components/MaterialPerformanceTable.tsx', 'utf8');

if (!content.includes('useUrlDateRange')) {
  // Try to find imports
  content = content.replace('import React, { useState, useEffect, useMemo, useRef } from "react";', 'import React, { useState, useEffect, useMemo, useRef } from "react";\nimport { useUrlDateRange } from "../hooks/useUrlDateRange";');
}

content = content.replace(
  'const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));\n  const [endDate, setEndDate] = useState<Date>(new Date());',
  'const { startDate, endDate, setStartDate, setEndDate } = useUrlDateRange(7);'
);

fs.writeFileSync('src/components/MaterialPerformanceTable.tsx', content);
