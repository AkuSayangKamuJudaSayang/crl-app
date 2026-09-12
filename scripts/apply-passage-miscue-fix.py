from pathlib import Path

path = Path("app/teacher/assessment/AssessmentClient.jsx")
text = path.read_text(encoding="utf-8")

replacements = []

def replace(old: str, new: str, label: str, count: int | None = 1):
    global text
    actual = text.count(old)
    if count is not None and actual != count:
        raise SystemExit(f"{label}: expected {count} occurrence(s), found {actual}")
    if count is None and actual < 1:
        raise SystemExit(f"{label}: expected at least one occurrence")
    text = text.replace(old, new, -1 if count is None else count)
    replacements.append(label)

replace(
    '  const [selectedMiscueType, setSelectedMiscueType] = useState(null);\n  const [reversionTargetWord, setReversionTargetWord] = useState("");\n  const [timeUpSelectedWord, setTimeUpSelectedWord] = useState(null);',
    '  const [selectedMiscueType, setSelectedMiscueType] = useState(null);\n  const [reversionSelecting, setReversionSelecting] = useState(false);\n  const [reversionSourceWord, setReversionSourceWord] = useState(null);\n  const [timeUpSelectedWord, setTimeUpSelectedWord] = useState(null);',
    "add reversion pair-selection state"
)

replace(
    '                    setReversionTargetWord(existingMiscue?.relatedWordIndex != null ? String(Number(existingMiscue.relatedWordIndex) + 1) : "");\n',
    '',
    "remove review-mode reversion number prefill",
    count=None,
)

replace(
    '                  setReversionTargetWord(existingMiscue?.relatedWordIndex != null ? String(Number(existingMiscue.relatedWordIndex) + 1) : "");\n',
    '',
    "remove selected-word reversion number prefill",
    count=None,
)

replace(
    '        setSelectedPassageWord(null);\n\n        await persistPassageDraft({\n          miscues: nextMiscues,\n        });',
    '        setSelectedPassageWord(null);\n        setReversionSelecting(false);\n        setReversionSourceWord(null);\n\n        await persistPassageDraft({\n          miscues: nextMiscues,\n        });',
    "clear reversion selection when removing a miscue"
)

replace(
    '        if (nextType === "Reversion") {\n          const targetNumber = Number(reversionTargetOverride ?? reversionTargetWord ?? 0);',
    '        if (nextType === "Reversion") {\n          const targetNumber = Number(reversionTargetOverride ?? 0);',
    "use clicked reversion target only"
)

replace(
    '          setSelectedPassageWord(null);\n          setSelectedMiscueType(null);\n          setReversionTargetWord("");\n          await persistPassageDraft({ miscues: nextMiscues });',
    '          setSelectedPassageWord(null);\n          setSelectedMiscueType(null);\n          setReversionSelecting(false);\n          setReversionSourceWord(null);\n          await persistPassageDraft({ miscues: nextMiscues });',
    "clear reversion selection after saving pair"
)

replace(
    '        setSelectedPassageWord(null);\n        setSelectedMiscueType(null);\n        setReversionTargetWord("");\n        await persistPassageDraft({ miscues: nextMiscues });',
    '        setSelectedPassageWord(null);\n        setSelectedMiscueType(null);\n        setReversionSelecting(false);\n        setReversionSourceWord(null);\n        await persistPassageDraft({ miscues: nextMiscues });',
    "clear reversion selection after saving normal miscue"
)

replace(
    '      setSelectedMiscueType(null);\n      setPassageMiscues([]);\n      setPassageWordsRead(0);',
    '      setSelectedMiscueType(null);\n      setReversionSelecting(false);\n      setReversionSourceWord(null);\n      setPassageMiscues([]);\n      setPassageWordsRead(0);',
    "reset reversion picker when leaving passage"
)

replace(
    '                <button type="button" style={styles.miscueDrawerClose} aria-label="Close miscue options" onClick={() => {setMiscueDrawerOpen(false);setSelectedMiscueType(null);setReversionTargetWord("");setMisreadWord("");}}>×</button>',
    '                <button type="button" style={styles.miscueDrawerClose} aria-label="Close miscue options" onClick={() => {setMiscueDrawerOpen(false);setSelectedPassageWord(null);setSelectedMiscueType(null);setReversionSelecting(false);setReversionSourceWord(null);setMisreadWord("");}}>×</button>',
    "clear blue word selection on miscue X"
)

replace(
    "                {[['Insertion','Added word or sound','#1766a9','#dff1ff'],['Omission','Word was skipped','#b32031','#ffe5e8'],['Substitution','Another word was said','#955900','#fff0d9'],['Repetition','Word was read more than once','#7041a8','#eee5ff'],['Reversion','Word or group of words not read in order','#9c3f8f','#f2e5f2'],['SelfCorrection','Word read incorrectly at first but immediately corrected','#287447','#e2f7e9']].map(([label,description,color,background]) => (\n                  <button key={label} type=\"button\" disabled={recordingMiscue} style={{...styles.miscueTypeButton,color,background,borderColor:color,...(selectedMiscueType===label?styles.miscueTypeButtonSelected:{})}} onClick={() => {setSelectedMiscueType(label);if(label==='Reversion'){setReversionTargetWord('');return;}if(label!=='Insertion'&&label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');}}>",
    "                {[['Insertion','Added word or sound','#1766a9','#dff1ff'],['Omission','Word was skipped','#b32031','#ffe5e8'],['Substitution','Another word was said','#955900','#fff0d9'],['Repetition','Word was read more than once','#7041a8','#eee5ff'],['Reversion','Word or group of words not read in order','#9c3f8f','#f2e5f2'],['SelfCorrection','Word read incorrectly at first but immediately corrected','#287447','#e2f7e9']].map(([label,description,color,background]) => (\n                  <button key={label} type=\"button\" disabled={recordingMiscue} style={{...styles.miscueTypeButton,color,background,borderColor:color,...(selectedMiscueType===label?styles.miscueTypeButtonSelected:{})}} onClick={() => {\n                    setSelectedMiscueType(label);\n                    if(label==='Reversion'){\n                      setMiscueDrawerOpen(false);\n                      setReversionSourceWord(Number(selectedPassageWord));\n                      setReversionSelecting(true);\n                      setError(\"\");\n                      return;\n                    }\n                    if(label!=='Insertion'&&label!=='Substitution')void recordPassageMiscue(selectedPassageWord,label,'');\n                  }}>",
    "open dedicated reversion word picker instead of asking for a number"
)

old_reversion_block = '''              {selectedMiscueType==='Reversion' && (\n                <div style={styles.miscueEntryArea}>\n                  <label style={styles.miscueEntryLabel}>Second word position</label>\n                  <input type=\"number\" min=\"1\" max=\"100\" inputMode=\"numeric\" value={reversionTargetWord} onChange={e=>setReversionTargetWord(e.target.value)} placeholder=\"Enter the other word number\" style={styles.miscueDrawerInput} disabled={recordingMiscue} autoFocus />\n                  <div style={{...styles.miscueDrawerHint,marginTop:\"6px\"}}>The two words will be marked with order numbers and a curved reversion arrow.</div>\n                  <button type=\"button\" style={styles.miscueApplyButton} onClick={() => void recordPassageMiscue(selectedPassageWord,'Reversion','',reversionTargetWord)} disabled={recordingMiscue||!reversionTargetWord}>Apply Reversion</button>\n                </div>\n              )}\n'''
replace(old_reversion_block, '', "remove reversion word-number input")

insert_after = '''        {miscueDrawerOpen && selectedPassageWord && (\n          <div style={styles.miscueOverlay} role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"passage-miscue-title\">'''
if insert_after not in text:
    raise SystemExit("reversion overlay insertion anchor missing")

reversion_overlay = '''        {reversionSelecting && reversionSourceWord && (\n          <div style={styles.reversionOverlay} role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"reversion-picker-title\">\n            <div style={styles.reversionPickerCard}>\n              <div style={styles.reversionPickerHeader}>\n                <div>\n                  <div style={styles.miscueDrawerEyebrow}>REVERSION OBSERVATION</div>\n                  <div id=\"reversion-picker-title\" style={styles.reversionPickerTitle}>Select the word the learner reversed</div>\n                  <div style={styles.miscueDrawerHint}>The original passage is masked while you select the second word. The selected first word is highlighted. Press the word that was read before the selected word, then the pair will be recorded automatically.</div>\n                </div>\n                <button\n                  type=\"button\"\n                  style={styles.miscueDrawerClose}\n                  aria-label=\"Cancel reversion selection\"\n                  onClick={() => {\n                    setReversionSelecting(false);\n                    setReversionSourceWord(null);\n                    setSelectedPassageWord(null);\n                    setSelectedMiscueType(null);\n                    setError(\"\");\n                  }}\n                >\n                  ×\n                </button>\n              </div>\n\n              <div style={styles.reversionSourceBadge}>\n                Selected first word: <strong>{passageText.split(/\\s+/).filter(Boolean)[Number(reversionSourceWord) - 1] || "Selected word"}</strong>\n              </div>\n\n              <div style={styles.reversionPassageMask}>\n                {(() => {\n                  let wordNumber = 0;\n                  return passageText.split(/(\\s+)/).map((token, index) => {\n                    if (!token.trim()) return token;\n                    const number = ++wordNumber;\n                    const isSource = number === Number(reversionSourceWord);\n                    const annotation = passageMiscues.find((item) => Number(item.wordIndex) === number - 1);\n                    return (\n                      <button\n                        key={`reversion-word-${index}`}\n                        type=\"button\"\n                        style={{\n                          ...styles.reversionWordButton,\n                          ...(isSource ? styles.reversionSourceWord : {}),\n                          ...(annotation ? styles.reversionExistingMiscueWord : {}),\n                        }}\n                        disabled={recordingMiscue || isSource}\n                        onClick={() => {\n                          if (isSource) return;\n                          void recordPassageMiscue(Number(reversionSourceWord), 'Reversion', '', number);\n                        }}\n                        aria-label={`Reversion word ${number}: ${token}${isSource ? ' (selected first word)' : ''}`}\n                      >\n                        {isSource && <span style={styles.reversionWordMarker}>1</span>}\n                        {token}\n                      </button>\n                    );\n                  });\n                })()}\n              </div>\n\n              <div style={styles.reversionPickerHint}>\n                Press the other word in the passage to complete the reversion pair. The two words will be saved with CRLA-style order markers and the reversion direction.\n              </div>\n            </div>\n          </div>\n        )}\n\n'''
text = text.replace(insert_after, reversion_overlay + insert_after, 1)
replacements.append("add dedicated reversion passage picker overlay")

style_anchor = '''  miscueOverlay: {\n    position: "fixed",'''
if style_anchor not in text:
    raise SystemExit("miscueOverlay style anchor missing")

reversion_styles = '''  reversionOverlay: {\n    position: "fixed",\n    inset: 0,\n    zIndex: 6000,\n    display: "flex",\n    alignItems: "center",\n    justifyContent: "center",\n    padding: "20px",\n    background: "rgba(9,28,46,.72)",\n    backdropFilter: "blur(9px)",\n    WebkitBackdropFilter: "blur(9px)",\n  },\n\n  reversionPickerCard: {\n    width: "min(1040px,96vw)",\n    maxHeight: "92vh",\n    overflowY: "auto",\n    padding: "28px",\n    borderRadius: "24px",\n    background: "linear-gradient(145deg,#f8fbff,#edf5fb)",\n    border: "1px solid #d3e1ec",\n    boxShadow: "0 30px 80px rgba(14,37,57,.35)",\n  },\n\n  reversionPickerHeader: {\n    display: "flex",\n    alignItems: "flex-start",\n    justifyContent: "space-between",\n    gap: "18px",\n  },\n\n  reversionPickerTitle: {\n    marginTop: "6px",\n    color: "#183e60",\n    fontSize: "28px",\n    lineHeight: 1.2,\n    fontWeight: "950",\n  },\n\n  reversionSourceBadge: {\n    marginTop: "18px",\n    padding: "12px 14px",\n    borderRadius: "13px",\n    background: "#e7f1fb",\n    border: "1px solid #c7dbed",\n    color: "#275b87",\n    fontSize: "14px",\n    fontWeight: "800",\n  },\n\n  reversionPassageMask: {\n    marginTop: "16px",\n    padding: "22px",\n    borderRadius: "18px",\n    background: "#ffffff",\n    border: "1px solid #d7e4ed",\n    boxShadow: "inset 3px 3px 10px rgba(132,159,180,.10), 0 10px 26px rgba(60,91,116,.10)",\n    color: "#243c55",\n    fontSize: "20px",\n    lineHeight: 2,\n  },\n\n  reversionWordButton: {\n    position: "relative",\n    border: "1px solid transparent",\n    borderRadius: "7px",\n    margin: "0 2px",\n    padding: "2px 5px",\n    background: "transparent",\n    color: "#243c55",\n    font: "inherit",\n    lineHeight: "inherit",\n    cursor: "pointer",\n    transition: "background .12s ease, color .12s ease, box-shadow .12s ease, transform .12s ease",\n  },\n\n  reversionWordButtonHover: {\n    background: "#e7f2fc",\n    color: "#1559a6",\n  },\n\n  reversionSourceWord: {\n    background: "#cfe5f8",\n    color: "#1559a6",\n    borderColor: "#4b91cf",\n    boxShadow: "inset 0 -3px 0 #4b91cf, 0 3px 9px rgba(74,136,190,.18)",\n    cursor: "default",\n  },\n\n  reversionExistingMiscueWord: {\n    boxShadow: "inset 0 -2px 0 rgba(180,74,90,.32)",\n  },\n\n  reversionWordMarker: {\n    position: "absolute",\n    top: "-15px",\n    left: "50%",\n    transform: "translateX(-50%)",\n    color: "#2f73c9",\n    fontSize: "12px",\n    lineHeight: 1,\n    fontWeight: "950",\n    pointerEvents: "none",\n  },\n\n  reversionPickerHint: {\n    marginTop: "12px",\n    color: "#71869a",\n    fontSize: "13px",\n    lineHeight: 1.55,\n  },\n\n'''
text = text.replace(style_anchor, reversion_styles + style_anchor, 1)
replacements.append("add reversion picker styles")

# Ensure the new picker is never left open when passage completion is entered.
replace(
    '          setMiscueDrawerOpen(false);\n          setMiscueReviewMode(false);\n          setSelectedPassageWord(null);',
    '          setMiscueDrawerOpen(false);\n          setMiscueReviewMode(false);\n          setReversionSelecting(false);\n          setReversionSourceWord(null);\n          setSelectedPassageWord(null);',
    "clear reversion picker when finishing passage"
)

# Defensive cleanup when switching to timeout review and other non-passage review states.
replace(
    '                              setMiscueDrawerOpen(false);\n                              setSelectedPassageWord(null);\n                              setSelectedMiscueType(null);\n                              setMisreadWord("");',
    '                              setMiscueDrawerOpen(false);\n                              setReversionSelecting(false);\n                              setReversionSourceWord(null);\n                              setSelectedPassageWord(null);\n                              setSelectedMiscueType(null);\n                              setMisreadWord("");',
    "clear reversion picker in timeout confirmation"
)

# Validate there is no longer any live reference to the removed number field/state.
if "reversionTargetWord" in text:
    raise SystemExit("reversionTargetWord still exists after patch")

# Validate required new UX pieces are present exactly once.
for needle in [
    "setSelectedPassageWord(null);setSelectedMiscueType(null);setReversionSelecting(false);setReversionSourceWord(null);",
    "setReversionSelecting(true);",
    "Select the word the learner reversed",
    "void recordPassageMiscue(Number(reversionSourceWord), 'Reversion', '', number);",
    "reversionOverlay",
]:
    if needle not in text:
        raise SystemExit(f"verification failed: missing {needle!r}")

path.write_text(text, encoding="utf-8")
print("Applied:", ", ".join(replacements))
