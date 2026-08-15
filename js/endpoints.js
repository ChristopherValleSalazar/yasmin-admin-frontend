/*
 * Calls every endpoint on AdminController with the session cookie and reports,
 * per endpoint, whether the backend authorized the request.
 *
 * The verdict is the absence of 401 and 403, not a 2xx. Reaching the handler is
 * the thing being proved, so a 409 from a status transition or a 405 from a
 * wrong method both count — the cookie got the request past AdminJwtFilter.
 *
 * The two GETs run on load. The three writes are armed behind a button: they
 * change real rows, and DELETE soft-deletes with no route back.
 */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG;
  const { date, appointmentId: id } = cfg.probe;

  const ADMIN = '/api/v1/admin';

  // AdminController maps the edit and delete routes without the slash before
  // the path variable, so these are the URLs Spring actually registered.
  const MAPPED_EDIT = `${ADMIN}/appointments${id}`;
  const INTENDED_EDIT = `${ADMIN}/appointments/${id}`;

  const EDIT_PARAMS = new URLSearchParams({
    phoneNumber: '+15555550123',
    language: 'EN',
    name: 'Endpoint Check',
    status: 'CONFIRMED',
  });

  const PANELS = [
    {
      title: 'Daily appointment rows',
      note: `Read-only. Returns a page of AppointmentRow for ${date}.`,
      auto: true,
      requests: [{ method: 'GET', path: `${ADMIN}/appointments/day?date=${date}&page=0&size=7` }],
    },
    {
      title: 'Full appointment details',
      note: 'Read-only. 404 here just means the id is not in the database — the request was still authorized.',
      auto: true,
      requests: [{ method: 'GET', path: `${ADMIN}/appointments/${id}` }],
    },
    {
      title: 'Set appointment status',
      warning: 'Writes. Moves the appointment to the selected status. Answers 409 unless it is currently CONFIRMED.',
      action: { name: 'action', options: ['COMPLETED', 'NO_SHOW'] },
      requests: [
        {
          method: 'PATCH',
          label: 'as mapped',
          path: (action) => `${ADMIN}/appointments/${id}/status?action=${action}`,
        },
      ],
    },
    {
      title: 'Edit appointment details',
      warning: 'Writes. Sends the DTO as query parameters, because the handler has no @RequestBody. '
        + 'If it does persist, AdminService:91 writes the phone number into the name field.',
      bug: 'Mapped as "/appointments{appointmentId}" with no slash, so the real path has the id joined onto the word appointments. '
        + 'The intended path is shown too and answers 405, since only GET is mapped there.',
      requests: [
        { method: 'PATCH', label: 'as mapped', path: `${MAPPED_EDIT}?${EDIT_PARAMS}` },
        { method: 'PATCH', label: 'as intended', path: `${INTENDED_EDIT}?${EDIT_PARAMS}` },
      ],
    },
    {
      title: 'Mark appointment for deletion',
      warning: 'Writes, and cannot be undone through the API. Sets the status to DELETED and stamps deletedAt.',
      bug: 'Mapped as "appointments{appointmentId}", missing both the leading slash and the one before the id. '
        + 'The intended path answers 405.',
      requests: [
        { method: 'DELETE', label: 'as mapped', path: MAPPED_EDIT },
        { method: 'DELETE', label: 'as intended', path: INTENDED_EDIT },
      ],
    },
  ];

  const root = document.getElementById('endpoint-list');
  const summary = document.getElementById('endpoint-summary');
  const verdicts = new Map();

  /*
   * 401 means the cookie never authenticated; 403 means it did but the
   * authority was wrong. Anything else reached the handler.
   */
  function verdictFor(result) {
    if (result.blocked) return { text: 'blocked — could not read the response', variant: 'bad' };
    if (result.status === 401) return { text: '401 — not authenticated', variant: 'bad' };
    if (result.status === 403) return { text: '403 — not authorized', variant: 'bad' };
    return { text: 'authorized', variant: 'good' };
  }

  function renderBody(result) {
    if (result.blocked) return result.bodyText;
    if (result.bodyJson !== null) return JSON.stringify(result.bodyJson, null, 2);
    if (!result.bodyText) return `${result.status} ${result.statusText || ''}`.trim() + ' — empty body';
    return result.bodyText;
  }

  function updateSummary() {
    const all = [...verdicts.values()];
    const authorized = all.filter((v) => v === 'good').length;
    summary.textContent = `${authorized} of ${all.length} requests authorized`;
    summary.className = `pill pill--${all.length && authorized === all.length ? 'good' : 'neutral'}`;
  }

  function renderResult(container, result) {
    const verdict = verdictFor(result);
    verdicts.set(result.url + result.method, verdict.variant);

    container.replaceChildren();

    const pills = document.createElement('div');
    pills.className = 'result__pills';

    const authPill = document.createElement('span');
    authPill.className = `pill pill--${verdict.variant}`;
    authPill.textContent = verdict.text;
    pills.appendChild(authPill);

    if (!result.blocked) {
      const statusPill = document.createElement('span');
      statusPill.className = 'pill pill--neutral';
      statusPill.textContent = `HTTP ${result.status}`;
      pills.appendChild(statusPill);
    }

    const timing = document.createElement('span');
    timing.className = 'muted small';
    timing.textContent = `${result.durationMs} ms`;
    pills.appendChild(timing);

    const body = document.createElement('pre');
    body.className = 'response';
    body.textContent = renderBody(result);

    container.append(pills, body);
    updateSummary();
  }

  function requestLine(method, path) {
    const line = document.createElement('code');
    line.className = 'request-line';
    line.textContent = `${method} ${cfg.apiOrigin}${path}`;
    return line;
  }

  function buildPanel(panel) {
    const card = document.createElement('section');
    card.className = 'card card--wide endpoint';

    const heading = document.createElement('h3');
    heading.className = 'section-title';
    heading.textContent = panel.title;
    card.appendChild(heading);

    if (panel.note) {
      const note = document.createElement('p');
      note.className = 'muted small endpoint__note';
      note.textContent = panel.note;
      card.appendChild(note);
    }

    if (panel.warning) {
      const warning = document.createElement('p');
      warning.className = 'alert alert--warning small';
      warning.textContent = panel.warning;
      card.appendChild(warning);
    }

    if (panel.bug) {
      const bug = document.createElement('p');
      bug.className = 'muted small endpoint__note';
      bug.textContent = `Backend note: ${panel.bug}`;
      card.appendChild(bug);
    }

    let selector = null;
    if (panel.action) {
      const label = document.createElement('label');
      label.className = 'field field--inline small';
      label.textContent = `${panel.action.name} `;
      selector = document.createElement('select');
      for (const option of panel.action.options) {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        selector.appendChild(opt);
      }
      label.appendChild(selector);
      card.appendChild(label);
    }

    // Each request gets its own line and its own result slot, so the mapped
    // and intended paths stay legible side by side.
    const slots = panel.requests.map((request) => {
      const block = document.createElement('div');
      block.className = 'result';

      if (request.label) {
        const tag = document.createElement('span');
        tag.className = 'result__label';
        tag.textContent = request.label;
        block.appendChild(tag);
      }

      const pathFor = () => (typeof request.path === 'function'
        ? request.path(selector ? selector.value : undefined)
        : request.path);

      const line = requestLine(request.method, pathFor());
      const output = document.createElement('div');
      output.className = 'result__output';

      block.append(line, output);
      card.appendChild(block);

      // Keep the printed URL honest when the selector changes.
      if (selector) {
        selector.addEventListener('change', () => {
          line.textContent = `${request.method} ${cfg.apiOrigin}${pathFor()}`;
        });
      }

      return { request, pathFor, output };
    });

    if (!panel.auto) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button--ghost endpoint__send';
      button.textContent = 'Send request';
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Sending…';
        try {
          for (const slot of slots) {
            const result = await window.adminApi.callEndpoint(slot.request.method, slot.pathFor());
            renderResult(slot.output, result);
          }
        } finally {
          button.disabled = false;
          button.textContent = 'Send again';
        }
      });
      card.appendChild(button);
    }

    return { card, slots, auto: Boolean(panel.auto) };
  }

  const built = PANELS.map(buildPanel);
  root.replaceChildren(...built.map((p) => p.card));

  // Only the read-only panels fire on their own, and only once the dashboard
  // has confirmed the session — otherwise this races a redirect to the login
  // form and fires requests from a page that is on its way out.
  document.addEventListener('admin:session-ready', async () => {
    for (const panel of built.filter((p) => p.auto)) {
      for (const slot of panel.slots) {
        const result = await window.adminApi.callEndpoint(slot.request.method, slot.pathFor());
        renderResult(slot.output, result);
      }
    }
  }, { once: true });
})();
