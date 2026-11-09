// Optional browser QA for administrator navigation into school years and sections.
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  http = require("http"),
  assert = require("assert/strict");
(async () => {
  const root = process.cwd(),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "crl-admin-sections-")),
    w = require("next/dist/compiled/webpack/webpack");
  w.init();
  fs.writeFileSync(
    path.join(temp, "jsx.cjs"),
    `module.exports=function(s){const done=this.async();require(${JSON.stringify(require.resolve("next/dist/build/swc"))}).transform(s,{filename:this.resourcePath,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).then(r=>done(null,r.code),done);}`,
  );
  fs.writeFileSync(
    path.join(temp, "css.cjs"),
    `module.exports=function(css){const names={};if(this.resourcePath.endsWith('.module.css')){let globals=[];css=css.replace(/:global\\(([^)]+)\\)/g,(_,x)=>'__GLOBAL'+(globals.push(x)-1)+'__');const prefix=this.resourcePath.split('/').pop().replace(/[^a-z]/gi,'');css=css.replace(/\\.([a-zA-Z_][a-zA-Z0-9_-]*)/g,(_,x)=>'.'+(names[x]=prefix+'_'+x));css=css.replace(/__GLOBAL(\\d+)__/g,(_,n)=>globals[n]);}return 'const style=document.createElement("style");style.textContent='+JSON.stringify(css)+';document.head.append(style);export default '+JSON.stringify(names);}`,
  );
  fs.writeFileSync(
    path.join(temp, "entry.jsx"),
    `import React from 'react';import{createRoot}from'react-dom/client';import Admin from ${JSON.stringify(path.join(root, "components/SystemAdminDashboard.jsx"))};const setup={years:[{startYear:2026,label:'2026-2027'},{startYear:2027,label:'2027-2028'}],sections:[{id:'33333333-3333-4333-8333-333333333333',name:'Mars',createdAt:'2026-11-01T00:00:00.000Z',classes:[{id:'44444444-4444-4444-8444-444444444444',teacherId:901,schoolYear:{id:'year-2027',startYear:2027,label:'2027-2028',deletedAt:null},archivedAt:null,unassignedAt:null,_count:{learners:2},viewLearners:[{id:406,lrn:'000000000001',firstName:'Sample',middleName:null,suffix:null,lastName:'Learner',sex:'Female'},{id:407,lrn:'000000000002',firstName:'Second',middleName:null,suffix:null,lastName:'Learner',sex:'Male'}]},{id:'55555555-5555-4555-8555-555555555555',teacherId:901,schoolYear:{id:'year-2026',startYear:2026,label:'2026-2027',deletedAt:null},archivedAt:null,unassignedAt:null,_count:{learners:1},viewLearners:[{id:408,lrn:'000000000003',firstName:'Earlier',middleName:'S',suffix:null,lastName:'Learner',sex:'Female'}]}]}],teachers:[{id:901,fullName:'Synthetic Teacher'}],assessments:[]};const profile={username:'synthetic-admin',full_name:'Synthetic Admin',email:'synthetic@example.test',school_name:'Synthetic School',school_id:'123456',two_factor_enabled:false};const entry={id:'entry-1',event:'section.reassigned',actorName:'Synthetic Admin',count:2,occurredAt:new Date().toISOString()};const base={user:profile,schools:[{id:'123456',name:'Synthetic School'}],coordinators:[{id:1,schoolId:'123456',fullName:'Synthetic Coordinator',username:'coordinator',isActive:true}],teachers:[{id:901,schoolId:'123456',fullName:'Synthetic Teacher',username:'teacher',isActive:true,_count:{learners:2,classSections:1}}],invites:[],admins:[],logs:[]};window.fetch=async(url,init={})=>{const u=new URL(url,location.origin),body=init.body?JSON.parse(init.body):{},action=body.action||u.searchParams.get('action');if(action==='section_setup')return{ok:true,status:200,json:async()=>structuredClone(setup)};if(action==='section_view'){const section=setup.sections.find(row=>row.id===body.section_id),schoolYears=section.classes.map(row=>({classSectionId:row.id,startYear:row.schoolYear.startYear,label:row.schoolYear.label,teacherId:row.teacherId,teacherName:'Synthetic Teacher',unassigned:Boolean(row.unassignedAt),learnerCount:row._count.learners})),learners=section.classes.flatMap(row=>row.viewLearners.map(learner=>({...learner,fullName:[learner.firstName,learner.middleName,learner.lastName,learner.suffix].filter(Boolean).join(' '),schoolYearLabel:row.schoolYear.label,schoolYearStart:row.schoolYear.startYear,teacherName:'Synthetic Teacher',unassigned:Boolean(row.unassignedAt)})));return{ok:true,status:200,json:async()=>({status:'ok',section:{id:section.id,name:section.name,createdAt:section.createdAt},schoolYears,learners})};}if(action==='section_deleted')return{ok:true,status:200,json:async()=>({sections:[{id:'22222222-2222-4222-8222-222222222222',name:'Retired Section',deletedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}],serverNow:new Date().toISOString()})};if(action==='profile')return{ok:true,status:200,json:async()=>({user:profile})};if(action==='logs')return{ok:true,status:200,json:async()=>u.searchParams.get('id')?{entry,detail:{classSectionId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',schoolYearId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'}}:{staff:[{id:901,fullName:'Synthetic Teacher',role:'teacher',_count:{classSections:1}}],entries:[entry],next_cursor:null}};if(action==='section_action'&&body.section_action==='add_many'){body.names.forEach((name,index)=>setup.sections.push({id:crypto.randomUUID(),name,createdAt:new Date(Date.now()+index).toISOString(),classes:[]}));return{ok:true,status:200,json:async()=>({status:'ok'})};}return{ok:true,status:200,json:async()=>structuredClone(base)};};createRoot(document.getElementById('root')).render(<Admin/>);`,
  );
  await new Promise((resolve, reject) =>
    w.webpack(
      {
        mode: "development",
        target: "web",
        devtool: false,
        entry: path.join(temp, "entry.jsx"),
        output: { path: temp, filename: "bundle.js" },
        resolve: {
          modules: [path.join(root, "node_modules")],
          extensions: [".js", ".jsx", ".mjs"],
        },
        module: {
          rules: [
            {
              test: /\.(jsx|js)$/,
              exclude: /node_modules/,
              use: path.join(temp, "jsx.cjs"),
            },
            { test: /\.css$/, use: path.join(temp, "css.cjs") },
          ],
        },
        plugins: [
          new w.webpack.DefinePlugin({
            "process.env.NODE_ENV": JSON.stringify("development"),
          }),
        ],
      },
      (error, stats) =>
        error
          ? reject(error)
          : stats.hasErrors()
            ? reject(Error(stats.toString({ all: false, errors: true })))
            : resolve(),
    ),
  );
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(fs.readFileSync(path.join(temp, "bundle.js")));
    } else if (req.url.includes(".png")) {
      res.setHeader("Content-Type", "image/png");
      res.end(fs.readFileSync(path.join(root, "public/crl-app-logo.png")));
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}</style><div id="root"></div><script src="/bundle.js"></script>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { chromium } = require(
      process.env.CRL_PLAYWRIGHT_MODULE || "playwright",
    ),
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CRL_BROWSER_EXECUTABLE,
      args:
        process.platform === "win32"
          ? []
          : [
              "--no-sandbox",
              "--no-zygote",
              "--single-process",
              "--disable-dev-shm-usage",
            ],
    });
  const context = await browser.newContext({ serviceWorkers: "block" }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const assertDarkSurfaces = async (label) => {
    const violations = await page.evaluate(() => {
      const roots = ["main", "header", "aside"],
        selector = roots
          .flatMap((root) =>
            [
              "section",
              "article",
              "fieldset",
              "div",
              "input",
              "textarea",
              "select",
              "[data-crl-select]",
              "[class*=panel]",
            ].map((tag) => `${root} ${tag}`),
          )
          .join(",");
      return [...document.querySelectorAll(selector)]
        .filter((node) => {
          const r = node.getBoundingClientRect();
          if (
            r.bottom <= 0 ||
            r.top >= innerHeight ||
            r.right <= 0 ||
            r.left >= innerWidth ||
            r.width < 100 ||
            r.height < 30
          )
            return false;
          const bg = getComputedStyle(node).backgroundColor,
            m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
          return (
            m &&
            (m[4] === undefined || Number(m[4]) > 0.5) &&
            Number(m[1]) > 215 &&
            Number(m[2]) > 215 &&
            Number(m[3]) > 215
          );
        })
        .map((node) => ({
          tag: node.tagName,
          cls: node.className,
          bg: getComputedStyle(node).backgroundColor,
          text: (node.innerText || node.value || "").slice(0, 80),
        }));
    });
    assert.equal(
      JSON.stringify(violations),
      "[]",
      `Light surfaces remain in ${label}: ${JSON.stringify(violations)}`,
    );
  };
  const assertDialogDark = async (dialog, label) => {
    const violations = await dialog.evaluate((el) =>
      [
        ...el.querySelectorAll(
          "section,article,fieldset,div,label,input,textarea,select,[data-crl-select]",
        ),
      ]
        .filter((node) => {
          const r = node.getBoundingClientRect();
          if (r.width < 100 || r.height < 30) return false;
          const bg = getComputedStyle(node).backgroundColor,
            m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
          return (
            m &&
            (m[4] === undefined || Number(m[4]) > 0.5) &&
            Number(m[1]) > 215 &&
            Number(m[2]) > 215 &&
            Number(m[3]) > 215
          );
        })
        .map((node) => ({
          tag: node.tagName,
          cls: node.className,
          bg: getComputedStyle(node).backgroundColor,
        })),
    );
    assert.equal(
      JSON.stringify(violations),
      "[]",
      `Light surfaces remain in ${label}: ${JSON.stringify(violations)}`,
    );
  };
  try {
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.evaluate(() => {
        localStorage.removeItem("crla_theme");
        document.documentElement.dataset.crlTheme = "light";
      });
      await page.reload();
      await page
        .getByRole("heading", {
          name: "Coordinators and Teachers",
          exact: true,
        })
        .waitFor();
      if (width <= 900) {
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
        await page.waitForTimeout(400);
      }
      const sidebarBox = await page.locator("aside").boundingBox(),
        logoBox = await page.locator("aside img").boundingBox();
      assert.ok(
        Math.abs(
          sidebarBox.x + sidebarBox.width / 2 - (logoBox.x + logoBox.width / 2),
        ) < 1,
        "Logo is not centered in the sidebar",
      );
      const trigger = page
        .getByRole("navigation", { name: "Administration" })
        .getByRole("button", {
          name: "School Years and Sections",
          exact: true,
        });
      await trigger.waitFor();
      if (width > 900) await trigger.hover();
      else await trigger.click();
      const views = page.getByRole("group", {
        name: "School year and section views",
      });
      await views.waitFor();
      await views
        .getByRole("button", { name: "Create Sections", exact: true })
        .waitFor();
      await views
        .getByRole("button", { name: "Assign Sections", exact: true })
        .waitFor();
      await views
        .getByRole("button", { name: "Deleted Sections", exact: true })
        .waitFor();
      await views
        .getByRole("button", { name: "Create Sections", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "School Years and Sections",
          exact: true,
        })
        .waitFor();
      const heading = page.getByRole("heading", {
          name: "School Years and Sections",
          exact: true,
        }),
        theme = page.getByRole("switch", { name: "Dark mode", exact: true });
      await theme.waitFor();
      const headingBox = await heading.boundingBox(),
        themeBox = await theme.boundingBox();
      assert.ok(
        themeBox.x > headingBox.x,
        "Theme toggle is not beside the tab title",
      );
      await page
        .getByRole("heading", { name: "Section list", exact: true })
        .waitFor();
      const marsRow = page
        .locator("[class*=yearRow]")
        .filter({ hasText: "Mars" });
      await marsRow.waitFor();
      assert.match(
        await marsRow.innerText(),
        /3 learners - 2 school years/,
      );
      assert.equal(
        await marsRow.getByRole("button", { name: "Edit", exact: true }).count(),
        0,
      );
      const marsActions = await marsRow
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons.map((button) => ({
            name: button.innerText.trim(),
            x: button.getBoundingClientRect().x,
          })),
        );
      assert.equal(
        JSON.stringify(marsActions.map((action) => action.name)),
        JSON.stringify(["View", "Rename", "Delete"]),
      );
      assert.ok(
        marsActions[0].x < marsActions[1].x &&
          marsActions[1].x < marsActions[2].x,
        "View and Rename are not beside each other before Delete",
      );
      await marsRow.getByRole("button", { name: "View", exact: true }).click();
      let sectionView = page.getByRole("dialog", { name: "Mars" });
      const categoryButtons = sectionView.getByRole("group", {
        name: "Section detail categories",
      });
      const schoolYearCategory = categoryButtons.getByRole("button", {
        name: "School Year",
        exact: true,
      });
      const learnersCategory = categoryButtons.getByRole("button", {
        name: "Learners",
        exact: true,
      });
      const schoolYearBox = await schoolYearCategory.boundingBox();
      const learnersBox = await learnersCategory.boundingBox();
      assert.ok(
        schoolYearBox.x < learnersBox.x &&
          Math.abs(schoolYearBox.y - learnersBox.y) < 2,
        "Section categories are not horizontally arranged",
      );
      await sectionView.getByText("2027-2028", { exact: true }).waitFor();
      await sectionView.getByText("2026-2027", { exact: true }).waitFor();
      await page.screenshot({
        path: path.join(temp, "section-view-years-" + width + ".png"),
      });
      assert.equal(
        await sectionView.getByText("Sample Learner", { exact: true }).count(),
        0,
      );
      await learnersCategory.click();
      await sectionView.getByText("Sample Learner", { exact: true }).waitFor();
      await sectionView.getByText("Earlier S Learner", { exact: true }).waitFor();
      await page.screenshot({
        path: path.join(temp, "section-view-learners-" + width + ".png"),
      });
      assert.equal(
        await sectionView
          .getByRole("region", { name: "School years", exact: true })
          .count(),
        0,
        "School years remain visible inside the learner category",
      );
      await sectionView
        .getByRole("button", { name: "Close", exact: true })
        .first()
        .click();
      await marsRow.getByRole("button", { name: "Rename", exact: true }).click();
      const renameDialog = page.getByRole("dialog", { name: "Edit section" });
      assert.equal(
        await renameDialog.locator("[class*=sectionRow]").count(),
        0,
        "Rename still has an extra rounded row container",
      );
      await renameDialog.getByLabel("Section name", { exact: true }).waitFor();
      await page.screenshot({
        path: path.join(temp, "section-rename-" + width + ".png"),
      });
      await renameDialog
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      assert.equal(
        await page
          .getByText(
            "Sections created here can be inserted into school years from Assign Sections.",
            { exact: true },
          )
          .count(),
        0,
      );
      const createButton = page.getByRole("button", {
        name: "Create +",
        exact: true,
      });
      await createButton.waitFor();
      const sortBox = await page
        .getByRole("combobox", { name: "Sort sections by" })
        .boundingBox();
      const createBox = await createButton.boundingBox();
      if (width > 420) {
        assert.ok(
          createBox.x > sortBox.x,
          "Create + is not positioned to the right of the section filters",
        );
      }
      await createButton.click();
      const create = page.getByRole("dialog", { name: "Create Sections" });
      assert.equal(
        await create
          .getByText("This adds the section to the reusable section list.", {
            exact: true,
          })
          .count(),
        0,
      );
      await create.getByLabel("Section 1").fill("Uranus");
      await create.getByRole("button", { name: "Add row +", exact: true }).click();
      await create.getByLabel("Section 2").fill("Uranus");
      assert.equal(
        await create
          .getByText("This section is already entered in another row.", {
            exact: true,
          })
          .count(),
        2,
      );
      const save = create.getByRole("button", { name: "Save", exact: true });
      assert.equal(await save.isDisabled(), true);
      await create.getByLabel("Section 2").fill("mars");
      await create
        .getByText("This section already exists in your school.", {
          exact: true,
        })
        .first()
        .waitFor();
      await create.getByLabel("Section 2").fill("Neptune");
      assert.equal(await save.isEnabled(), true);
      await save.click();
      await page.getByText("Uranus", { exact: true }).waitFor();
      await page.getByText("Neptune", { exact: true }).waitFor();
      assert.match(
        await page
          .locator("[class*=yearRow]")
          .filter({ hasText: "Uranus" })
          .innerText(),
        /0 learners - 0 school years/,
      );
      const search = page.getByRole("searchbox", { name: "Search sections" });
      await search.fill("uranus");
      const filteredRows = page.locator("[class*=yearRow]");
      await filteredRows.first().waitFor();
      assert.equal(await filteredRows.count(), 1);
      assert.match(await filteredRows.first().innerText(), /Uranus/);
      await search.fill("");
      const sortBy = page.getByRole("combobox", { name: "Sort sections by" });
      await sortBy.click();
      await page.getByRole("option", { name: "Date created", exact: true }).click();
      const direction = page.getByRole("combobox", {
        name: "Section sort direction",
      });
      await page.waitForFunction(() =>
        document
          .querySelector('[role=combobox][aria-label="Section sort direction"]')
          ?.innerText.includes("Newest first"),
      );
      assert.match(await filteredRows.first().innerText(), /Neptune/);
      await direction.click();
      await page.getByRole("option", { name: "Oldest first", exact: true }).click();
      assert.match(await filteredRows.first().innerText(), /Mars/);
      await sortBy.click();
      await page.getByRole("option", { name: "Name", exact: true }).click();
      await direction.click();
      await page.getByRole("option", { name: "Z – A", exact: true }).click();
      assert.match(await filteredRows.first().innerText(), /Uranus/);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.waitForTimeout(220);
      await page.screenshot({
        path: path.join(temp, "admin-sections-" + width + ".png"),
      });
      const themeSwitch = page.getByRole("switch", {
        name: "Dark mode",
        exact: true,
      });
      const readLayoutGeometry = () =>
        page
          .locator(
            "[class*=sectionListTools],[class*=sectionDirectoryList],[class*=yearRow]",
          )
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const box = node.getBoundingClientRect();
              return {
                x: Math.round(box.x * 10) / 10,
                y: Math.round(box.y * 10) / 10,
                width: Math.round(box.width * 10) / 10,
                height: Math.round(box.height * 10) / 10,
              };
            }),
          );
      const lightGeometry = await readLayoutGeometry();
      await themeSwitch.click();
      await page.waitForFunction(
        () => document.documentElement.dataset.crlTheme === "dark",
      );
      const darkGeometry = await readLayoutGeometry();
      assert.equal(
        JSON.stringify(darkGeometry),
        JSON.stringify(lightGeometry),
        "Section containers changed size when switching themes",
      );
      await assertDarkSurfaces(`Create sections at ${width}px`);
      const darkMarsRow = page
        .locator("[class*=yearRow]")
        .filter({ hasText: "Mars" });
      await darkMarsRow.getByRole("button", { name: "View", exact: true }).click();
      sectionView = page.getByRole("dialog", { name: "Mars" });
      await assertDialogDark(sectionView, `Section view dialog at ${width}px`);
      await sectionView
        .getByRole("button", { name: "Learners", exact: true })
        .click();
      await sectionView.getByText("Sample Learner", { exact: true }).waitFor();
      await sectionView
        .getByRole("button", { name: "Close", exact: true })
        .first()
        .click();
      await createButton.click();
      const dialog = page.getByRole("dialog", { name: "Create Sections" });
      await assertDialogDark(dialog, `Create section dialog at ${width}px`);
      await page.screenshot({
        path: path.join(temp, "admin-sections-dark-" + width + ".png"),
      });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      if (width <= 900)
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      const darkTrigger = page
        .getByRole("navigation", { name: "Administration" })
        .getByRole("button", {
          name: "School Years and Sections",
          exact: true,
        });
      if (width > 900) await darkTrigger.hover();
      else await darkTrigger.click();
      const darkViews = page.getByRole("group", {
        name: "School year and section views",
      });
      await darkViews
        .getByRole("button", { name: "Assign Sections", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Assign sections", exact: true })
        .waitFor();
      await page
        .locator("[class*=assignmentYear]")
        .filter({ hasText: "2027-2028" })
        .click();
      const assignmentName = page
        .locator("[class*=assignmentRow] strong")
        .filter({ hasText: "Mars" });
      await assignmentName.waitFor();
      assert.ok(
        Number.parseFloat(
          await assignmentName.evaluate((node) => getComputedStyle(node).fontSize),
        ) >= 18,
        "Assigned section names are too small",
      );
      await assertDarkSurfaces(`Assign Sections at ${width}px`);
      await page
        .getByRole("button", { name: "Insert section", exact: true })
        .click();
      const insertDialog = page.getByRole("dialog", { name: "Insert section" });
      await assertDialogDark(
        insertDialog,
        `Insert section dialog at ${width}px`,
      );
      await page.screenshot({
        path: path.join(temp, "assignment-dark-" + width + ".png"),
      });
      await insertDialog
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      const openAdminTab = async (name) => {
        if (width <= 900)
          await page
            .getByRole("button", { name: "Open navigation", exact: true })
            .click();
        await page
          .getByRole("navigation", { name: "Administration" })
          .getByRole("button", { name, exact: true })
          .click();
      };
      await openAdminTab("Coordinators and Teachers");
      await page
        .getByRole("heading", { name: "Synthetic School", exact: true })
        .waitFor();
      await assertDarkSurfaces(`Coordinators and Teachers at ${width}px`);
      await openAdminTab("Invite Coordinator");
      await page
        .getByText(
          "Coordinator invitations are assigned to a registered school and can be used once within seven days.",
        )
        .waitFor();
      await assertDarkSurfaces(`Invite Coordinator at ${width}px`);
      await page
        .getByRole("button", { name: "Invite coordinator", exact: true })
        .click();
      const inviteDialog = page.getByRole("dialog", {
        name: "Invite Reading Coordinator",
      });
      await assertDialogDark(
        inviteDialog,
        `Invite Coordinator dialog at ${width}px`,
      );
      await inviteDialog
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await openAdminTab("Logs");
      await page.getByRole("button", { name: /Synthetic School/ }).click();
      await page
        .getByRole("heading", { name: "Synthetic School", exact: true })
        .waitFor();
      await assertDarkSurfaces(`Logs at ${width}px`);
      await page.getByRole("button", { name: "View", exact: true }).click();
      const logDialog = page.getByRole("dialog");
      await logDialog.waitFor();
      await assertDialogDark(logDialog, `Log detail dialog at ${width}px`);
      await logDialog
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click();
      if (width <= 900)
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Open your profile", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Profile", exact: true })
        .waitFor();
      await page.getByText("synthetic@example.test", { exact: true }).waitFor();
      await page.getByRole("button", { name: /Security & Privacy/ }).click();
      await assertDarkSurfaces(`Profile at ${width}px`);
      if (width <= 900)
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      const deletedTrigger = page
        .getByRole("navigation", { name: "Administration" })
        .getByRole("button", {
          name: "School Years and Sections",
          exact: true,
        });
      if (width > 900) await deletedTrigger.hover();
      else await deletedTrigger.click();
      await page
        .getByRole("group", { name: "School year and section views" })
        .getByRole("button", { name: "Deleted Sections", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Deleted Sections", exact: true })
        .waitFor();
      await assertDarkSurfaces(`Deleted Sections at ${width}px`);
      console.log(
        "PASS admin toggle placement, logo navigation, all admin tabs, section workspaces, dialogs and dark surfaces at",
        width,
      );
    }
    assert.deepEqual(errors, []);
    console.log("Browser QA files:", temp);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
