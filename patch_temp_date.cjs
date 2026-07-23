const fs = require('fs');
let file = 'src/components/AccountDetailsPage.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/const \[tempDateRange, setTempDateRange\] = useState<\{ from: Date; to\?: Date \}>\(\(\) => \{[\s\S]*?to: subDays\(new Date\(\), 1\),\n    \};\n  \}\);/, 'const [tempDateRange, setTempDateRange] = useState<{ from: Date; to?: Date }>({ from: subDays(new Date(), 6), to: new Date() });');
fs.writeFileSync(file, content);
