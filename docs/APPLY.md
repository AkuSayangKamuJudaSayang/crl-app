# Apply the fix

Copy these complete files into the project, replacing the existing files:

- `app/teacher/page.jsx`
- `app/api/assessment/route.js`
- `app/api/reports/excel/route.js`

Then run:

```bash
npm run build
```

After a successful build, commit and push:

```bash
git status
git add app/teacher/page.jsx app/api/assessment/route.js app/api/reports/excel/route.js
git commit -m "Enforce teacher section isolation"
git push origin main
```

Do not stage `.env` files or other secrets.

After Vercel deploys, log in as a teacher whose section is Jupiter. The Conduct Assessment roster, assessment records, analytics inputs, and Excel exports should contain only that teacher's own Jupiter learners. A learner whose section is Mars should no longer be returned to that account.
