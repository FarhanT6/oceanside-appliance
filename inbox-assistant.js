// ============================================================
//   OCEANSIDE APPLIANCE — INBOX ASSISTANT (companion script)
//
//   This small script lives in the Gmail account customers email
//   (oceansideappliance96@gmail.com). Every 10 minutes it looks at new
//   emails, asks the main Oceanside Appliance script to read each one, and
//   for real customer emails it saves a DRAFT reply in the same thread and
//   adds the label "AI-draft-ready". It never sends anything — you review,
//   edit and send the draft yourself (on your phone or computer).
//
//   Your Claude API key stays in the main script; this one only needs the
//   web app URL and your staff key.
//
//   SETUP (once, about 3 minutes):
//   1. Sign in to Google as oceansideappliance96@gmail.com.
//   2. Go to script.google.com → New project. Name it "Inbox Assistant".
//   3. Delete what's there, paste this whole file, and Save.
//   4. Project Settings (gear) → Script properties → add:
//        WEB_APP_URL = the /exec URL of your Oceanside Appliance web app
//                      (Deploy → Manage deployments in the main script)
//        STAFF_KEY   = your staff key (the one you pasted into the staff panel)
//   5. Back in the editor pick setupInboxAssistant → ▶ Run → allow access.
//   Done. To turn it off, run stopInboxAssistant.
// ============================================================

const LABEL_CHECKED = 'AI-checked';
const LABEL_DRAFT = 'AI-draft-ready';
const SEARCH = 'in:inbox newer_than:2d -category:promotions -category:social -category:updates -category:forums';
const SKIP_SENDERS = /(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?@|alerts?@|billing@|receipts?@)/i;

// ▶ Run once
function setupInboxAssistant() {
  const res = callMainScript({ type: 'admin_ping' });
  if (!res.success) throw new Error('Could not reach the main script: ' + (res.error || 'unknown error') + '. Check WEB_APP_URL and STAFF_KEY.');
  stopInboxAssistant();
  ScriptApp.newTrigger('checkInbox').timeBased().everyMinutes(10).create();
  label(LABEL_CHECKED); label(LABEL_DRAFT);
  Logger.log('Inbox assistant is on. New customer emails get a draft reply within about 10 minutes.');
}

function stopInboxAssistant() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkInbox').forEach(t => ScriptApp.deleteTrigger(t));
}

function checkInbox() {
  const props = PropertiesService.getScriptProperties();
  const done = JSON.parse(props.getProperty('DONE_IDS') || '[]');
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  const checked = label(LABEL_CHECKED), drafted = label(LABEL_DRAFT);
  let handled = 0;

  GmailApp.search(SEARCH, 0, 20).forEach(thread => {
    if (handled >= 6) return; // keep each run short
    const msgs = thread.getMessages();
    const last = msgs[msgs.length - 1];
    const id = last.getId();
    if (done.indexOf(id) >= 0) return;
    const from = last.getFrom();
    // Skip our own replies, automated senders, and threads that already have a draft
    if (from.toLowerCase().indexOf(me) >= 0 || SKIP_SENDERS.test(from) || last.isDraft()) { done.push(id); return; }

    const earlier = msgs.slice(-4, -1).map(m => 'From: ' + m.getFrom() + '\n' + m.getPlainBody().slice(0, 1500)).join('\n---\n');
    const res = callMainScript({ type: 'admin_ai_email', email: {
      id: id, from: from, subject: thread.getFirstMessageSubject(), body: last.getPlainBody().slice(0, 6000), earlier: earlier
    } });
    if (!res.success) { Logger.log('Skipped "' + thread.getFirstMessageSubject() + '": ' + res.error); return; } // retried next run
    const r = res.result || {};
    if (r.isCustomer && r.replyDraft && !res.cached) {
      last.createDraftReply(r.replyDraft);
      thread.addLabel(drafted);
    }
    thread.addLabel(checked);
    done.push(id);
    handled++;
  });
  props.setProperty('DONE_IDS', JSON.stringify(done.slice(-300)));
}

function callMainScript(payload) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('WEB_APP_URL'), key = props.getProperty('STAFF_KEY');
  if (!url || !key) throw new Error('Add WEB_APP_URL and STAFF_KEY in Project Settings → Script properties first.');
  payload.key = key;
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify(payload),
    followRedirects: true, muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()); }
  catch (err) { return { success: false, error: 'Unexpected response (' + res.getResponseCode() + ')' }; }
}

function label(name) { return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); }
