const fs = require("node:fs");
const path = require("node:path");

const target = path.join(process.cwd(), "app", "learner", "LearnerAssessmentPage.jsx");
let source = fs.readFileSync(target, "utf8");

const passageCase = /\{stage ===\s*"passage" && \([\s\S]*?(?=\n\s*\{stage ===\s*"comprehension")/;
const replacement = [
  '{stage ===',
  '                    "passage" && (',
  '                    <div>',
  '                      <div className="passage-title">',
  '                        {session?.story_title || selectedStory.title}',
  '                      </div>',
  '                      <div className="passage" role="status" aria-live="polite">',
  '                        {resolvedPassageText ? (',
  '                          resolvedPassageText.split(/\\s+/).filter(Boolean).join(" ")',
  '                        ) : (',
  '                          <span style={{display:"block",textAlign:"center",color:"#71869a",fontSize:"18px",fontWeight:800}}>',
  '                            Loading story passage...',
  '                          </span>',
  '                        )}',
  '                      </div>',
  '                    </div>',
  '                  )}',
  '',
].join("\n");

if (passageCase.test(source)) {
  source = source.replace(passageCase, replacement);
} else {
  console.warn("[CRL passage renderer] passage case anchor not found; leaving existing source unchanged.");
}

const marker = "CRL_PASSAGE_RENDERER_REPAIR_V1";
if (!source.includes(marker)) {
  const markerBlock = "        </div>\n        {/* " + marker + " */}\n      </main>\n";
  source = source.replace("        </div>\n      </main>\n", markerBlock);
}

fs.writeFileSync(target, source, "utf8");
console.log("Applied CRL passage renderer repair: safe loading state and selected-story content only.");
