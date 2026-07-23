const fs = require('fs');
let content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

content = content.replace(/const \[startDate, setStartDate\] = useState<Date>\(\(\) => \{[\s\S]*?return subDays\(new Date\(\), 1\);\n  \}\);/, 'const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 6));');
content = content.replace(/const \[endDate, setEndDate\] = useState<Date>\(\(\) => \{[\s\S]*?return subDays\(new Date\(\), 1\);\n  \}\);/, 'const [endDate, setEndDate] = useState<Date>(new Date());');
content = content.replace(/useEffect\(\(\) => \{\n    if \(startDate\) \{\n      localStorage\.setItem\("META_DASHBOARD_START_DATE", startDate\.toISOString\(\)\);\n    \}\n  \}, \[startDate\]\);/, '');
content = content.replace(/useEffect\(\(\) => \{\n    if \(endDate\) \{\n      localStorage\.setItem\("META_DASHBOARD_END_DATE", endDate\.toISOString\(\)\);\n    \}\n  \}, \[endDate\]\);/, '');

content = content.replace(/try \{\n        const stored = localStorage\.getItem\("META_ACCOUNT_MAPPINGS"\);\n        if \(stored\) setMappings\(JSON\.parse\(stored\)\);\n      \} catch \(e\) \{\}/g, 'setMappings({});');

fs.writeFileSync('src/components/Dashboard.tsx', content);
