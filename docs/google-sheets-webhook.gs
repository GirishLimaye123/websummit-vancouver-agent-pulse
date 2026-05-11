const SHEET_NAME = "Responses";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const sheet = getSheet();

  sheet.appendRow([
    payload.receivedAt || new Date().toISOString(),
    payload.id || "",
    (payload.camps || []).join(", "),
    payload.note || "",
    payload.allocation?.maximalist ?? "",
    payload.allocation?.roi ?? "",
    payload.allocation?.danger ?? "",
    payload.allocation?.architecture ?? "",
    payload.clientCreatedAt || "",
    payload.userAgent || "",
    payload.source || ""
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "receivedAt",
      "id",
      "camps",
      "note",
      "nobelAgentsChips",
      "hypeRoiChips",
      "tooDangerousChips",
      "wrongArchitectureChips",
      "clientCreatedAt",
      "userAgent",
      "source"
    ]);
  }
  return sheet;
}
