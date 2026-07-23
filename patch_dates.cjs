const fs = require('fs');
['src/components/AccountDetailsPage.tsx', 'src/components/StoreDetailsPage.tsx'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace(/const \[startDate, setStartDate\] = useState<Date>\(\(\) => \{[\s\S]*?return subDays\(new Date\(\), 1\);\n  \}\);/, 'const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 6));');
  content = content.replace(/const \[endDate, setEndDate\] = useState<Date>\(\(\) => \{[\s\S]*?return subDays\(new Date\(\), 1\);\n  \}\);/, 'const [endDate, setEndDate] = useState<Date>(new Date());');
  content = content.replace(/useEffect\(\(\) => \{\n    if \(startDate\) \{\n      localStorage\.setItem\("META_DASHBOARD_START_DATE", startDate\.toISOString\(\)\);\n    \}\n  \}, \[startDate\]\);/, '');
  content = content.replace(/useEffect\(\(\) => \{\n    if \(endDate\) \{\n      localStorage\.setItem\("META_DASHBOARD_END_DATE", endDate\.toISOString\(\)\);\n    \}\n  \}, \[endDate\]\);/, '');

  fs.writeFileSync(file, content);
});
