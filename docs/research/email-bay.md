# Email Bay Research

*Research Date: 2026-02-03*

---

## 1. Problem Statement

ClawDock needs an Email Bay for bidirectional email communication that:
- Receives emails via IMAP (polling-based via Heartbeat daemon)
- Sends emails via SMTP
- Parses email content (text, HTML, attachments)
- Exposes API/CLI interface only (no browser/TUI)
- Runs as a self-contained component or Docker container
- Integrates with the existing Bay interface pattern

Unlike RSS (inbound-only), Email is inherently bidirectional - we need both send and receive capabilities.

---

## 2. Existing Solutions

### 2.1 Node.js IMAP Libraries

#### imapflow (Recommended)
- **Repo**: github.com/postalsys/imapflow
- **Author**: Andris Reinman (creator of Nodemailer)
- **License**: MIT

**Pros**:
- Modern `async/await` API (Promise-based)
- Native TypeScript support with full type definitions
- Built-in IDLE support for real-time updates
- Handles Gmail/Outlook IMAP quirks gracefully
- Excellent memory management (state machine architecture)
- Minimal dependencies
- Active development (2024 updates)
- Supports modern IMAP extensions: OBJECTID, MOVE, IDLE, COMPRESS

**Cons**:
- Higher-level API (less control for obscure IMAP commands)
- Still requires `mailparser` for full MIME parsing

**Usage**:
```typescript
import { ImapFlow } from 'imapflow';

const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: 'user@gmail.com',
    pass: 'app-password'
  }
});

await client.connect();
const mailbox = await client.mailboxOpen('INBOX');
console.log(`${mailbox.exists} messages in mailbox`);

// Fetch unread messages
for await (let message of client.fetch({ seen: false }, { envelope: true })) {
  console.log(message.envelope.subject);
}

await client.logout();
```

#### node-imap (Legacy - Not Recommended)
- **Repo**: github.com/mscdex/node-imap
- **Last Update**: ~2018 (stagnant)

**Pros**:
- Lower-level control
- Historically the only option

**Cons**:
- Callback-heavy (requires wrapping in Promises)
- Unresolved bugs with modern email providers
- Security vulnerabilities in dependency tree
- No TypeScript support
- Memory leaks with large attachments

**Verdict**: Use `imapflow` for all new projects. `node-imap` is legacy.

---

### 2.2 Node.js SMTP Libraries

#### nodemailer (The Standard)
- **Repo**: github.com/nodemailer/nodemailer
- **Author**: Andris Reinman
- **Stars**: 16,000+ | **License**: MIT
- **Install**: `npm install nodemailer`

**Pros**:
- De facto standard for Node.js email sending
- Zero runtime dependencies
- Full TypeScript support (`@types/nodemailer`)
- Connection pooling for high-volume sending
- DKIM signing support
- OAuth2 authentication (Gmail, Outlook)
- Attachment streaming (memory efficient)
- HTML and plain text with automatic fallback
- Embedded image support (CID attachments)

**Cons**:
- None significant - it's the industry standard

**Usage**:
```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 465,
  secure: true,
  pool: true,  // Enable connection pooling
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

await transporter.sendMail({
  from: 'ClawDock <agent@clawdock.dev>',
  to: 'user@example.com',
  subject: 'Task Complete',
  text: 'Your task has been completed.',
  html: '<p>Your task has been <strong>completed</strong>.</p>',
  attachments: [
    { filename: 'report.pdf', path: '/path/to/report.pdf' }
  ]
});
```

---

### 2.3 Email Parsing Libraries

#### mailparser (Companion to nodemailer)
- **Repo**: github.com/nodemailer/mailparser
- **Author**: Andris Reinman (same as nodemailer/imapflow)
- **Install**: `npm install mailparser`

**Pros**:
- Converts raw MIME to structured JavaScript objects
- Handles all charsets and transfer encodings
- Streaming support for large attachments
- Extracts headers, body (text/HTML), and attachments
- Handles inline images (CID references)

**Usage**:
```typescript
import { simpleParser } from 'mailparser';

// Parse raw email source from IMAP
const parsed = await simpleParser(rawEmailSource);

console.log('Subject:', parsed.subject);
console.log('From:', parsed.from.text);
console.log('Text:', parsed.text);
console.log('HTML:', parsed.html);

// Handle attachments
for (const attachment of parsed.attachments) {
  console.log(`Attachment: ${attachment.filename} (${attachment.size} bytes)`);
  // attachment.content is a Buffer
}
```

**For Large Attachments (Streaming)**:
```typescript
import { MailParser } from 'mailparser';

const parser = new MailParser();

parser.on('data', data => {
  if (data.type === 'attachment') {
    const output = fs.createWriteStream(`./${data.filename}`);
    data.content.pipe(output);
    data.content.on('end', () => data.release());
  }
});

emailStream.pipe(parser);
```

---

### 2.4 Complete Self-Hosted Email Solutions

#### Mailcow (Full-Stack Email Server)
- **Repo**: github.com/mailcow/mailcow-dockerized
- **Stars**: 8,000+ | **License**: GPL-3.0
- **Stack**: Docker Compose (Postfix, Dovecot, Rspamd, SOGo, MariaDB, Redis)

**Pros**:
- Complete email server (IMAP, SMTP, spam filtering, webmail)
- Comprehensive REST API (Swagger documented)
- Built-in admin UI with 2FA
- Automatic Let's Encrypt SSL
- Sync jobs for migration from other providers

**Cons**:
- **Heavy**: Requires 4GB+ RAM, multiple containers
- **Overkill**: Full MTA when we just need client access
- Requires port 25 (often blocked by cloud providers)
- Requires PTR records for deliverability
- Not suitable for ClawDock's "connect to existing email" use case

**Verdict**: Mailcow is for running your own email service, not for connecting to existing email accounts.

#### Postal (Outbound Email Server)
- **Repo**: github.com/postalserver/postal
- **Stars**: 14,000+ | **License**: MIT
- **Stack**: Ruby, MySQL/MariaDB, RabbitMQ

**Pros**:
- Designed for transactional email sending
- Webhooks for bounces and delivery events
- Web API for sending

**Cons**:
- Outbound only (no IMAP/receive)
- Complex setup (multiple services)
- Ruby stack (not our ecosystem)

**Verdict**: Not suitable - outbound only, different use case.

#### Lighter Alternatives

| Solution | Type | Language | Use Case |
|----------|------|----------|----------|
| **Mailpit** | SMTP capture | Go | Dev/testing, webhooks on receive |
| **smtp2http** | SMTP relay | Go | Convert incoming SMTP to webhooks |
| **Haraka** | SMTP server | Node.js | Plugin-based SMTP processing |

These are for building email infrastructure, not for connecting to existing accounts.

---

### 2.5 API-Based Email Services

These are SaaS alternatives if self-hosting is problematic:

| Service | Inbound | Outbound | API |
|---------|---------|----------|-----|
| **Mailgun** | Yes (routes) | Yes | REST |
| **SendGrid** | Yes (parse) | Yes | REST |
| **Postmark** | Yes | Yes | REST |

**Verdict**: Not suitable for ClawDock's self-hosted vision, but could be a fallback option.

---

## 3. Recommendation

### Decision: **BUILD** - Lightweight Library Stack

**Rationale**:

1. **No Existing Complete Solution Fits**:
   - Mailcow/Postal are for running email servers, not connecting to existing accounts
   - There's no "Miniflux for email" - a lightweight API wrapper for IMAP/SMTP

2. **The Building Blocks Are Excellent**:
   - `imapflow` (receive) + `nodemailer` (send) + `mailparser` (parse)
   - All three maintained by Andris Reinman, well-integrated
   - All TypeScript-ready, Promise-based, actively maintained

3. **Low Complexity for Our Use Case**:
   - Connect to existing IMAP server (Gmail, Outlook, self-hosted)
   - Connect to existing SMTP server
   - No need to run MTA, spam filtering, or storage
   - Simple polling via Heartbeat (no persistent IDLE daemon needed initially)

4. **Stack Alignment**:
   - Pure Node.js/TypeScript
   - No external containers needed
   - Runs as part of main ClawDock process or simple service

### Why Not FIND?

There's no equivalent to Miniflux for email access. All self-hosted solutions are either:
- Full email servers (overkill for connecting to existing accounts)
- Outbound-only (Postal, SMTP relays)
- Dev/testing tools (Mailpit, MailHog)

### Why Not a Full Email Server?

ClawDock agents will typically:
- Connect to user's existing Gmail/Outlook/corporate email
- Use App Passwords or OAuth2 for authentication
- Not need to run a full MTA

---

## 4. Implementation Notes

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ClawDock Castle                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Gateway    │  │  Heartbeat   │  │   Email Bay     │   │
│  │              │  │   Daemon     │  │  (TypeScript)   │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                    │            │
│         │                 │   poll interval    │            │
│         │                 ├───────────────────►│            │
│         │                 │                    │            │
│         │                 │   check via IMAP   │            │
│         │                 │                    ├───────┐    │
│         │                 │                    │       │    │
│         │                 │◄───────────────────┤       ▼    │
│         │                 │   new emails?      │  ┌───────┐ │
│         │                 │                    │  │ IMAP  │ │
│         │   send email    │                    │  │ SMTP  │ │
│         │─────────────────┼───────────────────►│  │Server │ │
│         │                 │                    │  └───────┘ │
│  ┌──────┴───────┐                              │  (External)│
│  │  OpenCode    │                              │            │
│  │   Server     │                              │            │
│  └──────────────┘                              │            │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Bay Interface Implementation

```typescript
// packages/email-bay/src/index.ts

interface EmailBayConfig {
  imap: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
  from: string;  // Default sender address
}

interface EmailMessage {
  id: string;
  uid: number;
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  date: Date;
  attachments: EmailAttachment[];
}

interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
}

// Email Bay implementing ClawDock Bay interface
interface EmailBay {
  // === Inbound (IMAP) ===
  
  // Check for new emails (called by Heartbeat)
  check(): Promise<{ hasNew: boolean; count: number }>;
  
  // Fetch unread emails for processing
  fetch(limit?: number): Promise<EmailMessage[]>;
  
  // Mark emails as read after processing
  markRead(uids: number[]): Promise<void>;
  
  // Search emails with criteria
  search(criteria: SearchCriteria): Promise<EmailMessage[]>;
  
  // === Outbound (SMTP) ===
  
  // Send an email
  send(options: SendOptions): Promise<{ messageId: string }>;
  
  // Reply to an email (preserves threading)
  reply(originalUid: number, body: string): Promise<{ messageId: string }>;
}
```

### 4.3 Core Implementation

```typescript
// packages/email-bay/src/email-bay.ts

import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export class EmailBayImpl implements EmailBay {
  private imapConfig: EmailBayConfig['imap'];
  private smtpTransporter: Transporter;
  private fromAddress: string;
  private lastSeenUid: number = 0;

  constructor(config: EmailBayConfig) {
    this.imapConfig = config.imap;
    this.fromAddress = config.from;
    
    // Create SMTP transporter with connection pooling
    this.smtpTransporter = nodemailer.createTransport({
      ...config.smtp,
      pool: true,
      maxConnections: 5,
    });
  }

  async check(): Promise<{ hasNew: boolean; count: number }> {
    const client = new ImapFlow(this.imapConfig);
    
    try {
      await client.connect();
      const mailbox = await client.mailboxOpen('INBOX');
      
      // Search for unseen messages
      const unseen = await client.search({ seen: false });
      
      return {
        hasNew: unseen.length > 0,
        count: unseen.length
      };
    } finally {
      await client.logout();
    }
  }

  async fetch(limit: number = 10): Promise<EmailMessage[]> {
    const client = new ImapFlow(this.imapConfig);
    const messages: EmailMessage[] = [];
    
    try {
      await client.connect();
      await client.mailboxOpen('INBOX');
      
      // Fetch unseen messages
      const unseenUids = await client.search({ seen: false });
      const uidsToFetch = unseenUids.slice(0, limit);
      
      if (uidsToFetch.length === 0) return [];
      
      for await (const msg of client.fetch(uidsToFetch, {
        uid: true,
        source: true,  // Get full raw source for mailparser
        envelope: true,
        flags: true,
      })) {
        // Parse with mailparser for full content
        const parsed = await simpleParser(msg.source);
        
        messages.push({
          id: msg.envelope.messageId,
          uid: msg.uid,
          from: parsed.from?.text || '',
          to: parsed.to ? [parsed.to.text] : [],
          subject: parsed.subject || '',
          text: parsed.text,
          html: parsed.html || undefined,
          date: parsed.date || new Date(),
          attachments: parsed.attachments.map(att => ({
            filename: att.filename || 'unnamed',
            contentType: att.contentType,
            size: att.size,
            content: att.content,
          })),
        });
      }
      
      return messages;
    } finally {
      await client.logout();
    }
  }

  async markRead(uids: number[]): Promise<void> {
    const client = new ImapFlow(this.imapConfig);
    
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      
      try {
        await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async send(options: SendOptions): Promise<{ messageId: string }> {
    const info = await this.smtpTransporter.sendMail({
      from: options.from || this.fromAddress,
      to: options.to,
      cc: options.cc,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });
    
    return { messageId: info.messageId };
  }

  async reply(originalUid: number, body: string): Promise<{ messageId: string }> {
    // Fetch original message to get headers for threading
    const client = new ImapFlow(this.imapConfig);
    
    try {
      await client.connect();
      await client.mailboxOpen('INBOX');
      
      let original: ParsedMail | null = null;
      
      for await (const msg of client.fetch([originalUid], { source: true })) {
        original = await simpleParser(msg.source);
      }
      
      if (!original) throw new Error(`Message ${originalUid} not found`);
      
      const info = await this.smtpTransporter.sendMail({
        from: this.fromAddress,
        to: original.from?.text,
        subject: `Re: ${original.subject}`,
        text: body,
        inReplyTo: original.messageId,
        references: original.references 
          ? [...original.references, original.messageId].join(' ')
          : original.messageId,
      });
      
      return { messageId: info.messageId };
    } finally {
      await client.logout();
    }
  }
}
```

### 4.4 Configuration

```yaml
# In config/bays/email.yml
email:
  enabled: true
  imap:
    host: imap.gmail.com
    port: 993
    secure: true
    auth:
      user: ${EMAIL_USER}
      pass: ${EMAIL_APP_PASSWORD}
  smtp:
    host: smtp.gmail.com
    port: 465
    secure: true
    auth:
      user: ${EMAIL_USER}
      pass: ${EMAIL_APP_PASSWORD}
  from: "ClawDock Agent <${EMAIL_USER}>"
  
  # Polling (via Heartbeat)
  check_interval: 5m
  
  # Processing
  triggers:
    - condition: "any_new"
      action: process
      prompt_template: heartbeat/email-handler.md
```

### 4.5 Heartbeat Integration

```typescript
// In Heartbeat daemon
import { EmailBayImpl } from '@clawdock/email-bay';

const emailBay = new EmailBayImpl(config.email);

// Called by Heartbeat on schedule
async function checkEmails(): Promise<WorkItem[]> {
  const { hasNew, count } = await emailBay.check();
  
  if (!hasNew) return [];
  
  const emails = await emailBay.fetch(10);
  
  return emails.map(email => ({
    type: 'email',
    source: 'email-bay',
    data: email,
    promptTemplate: 'email-handler.md',
  }));
}

// After Agent processes
async function onEmailProcessed(uid: number): Promise<void> {
  await emailBay.markRead([uid]);
}
```

### 4.6 Gmail Setup Notes

For Gmail, users need:
1. Enable "Less secure app access" OR use App Passwords with 2FA
2. Enable IMAP in Gmail settings
3. Use `imap.gmail.com:993` and `smtp.gmail.com:465`

```typescript
// Gmail-specific config
const gmailConfig: EmailBayConfig = {
  imap: {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: 'user@gmail.com',
      pass: 'xxxx-xxxx-xxxx-xxxx'  // App Password
    }
  },
  smtp: {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: 'user@gmail.com',
      pass: 'xxxx-xxxx-xxxx-xxxx'  // Same App Password
    }
  },
  from: 'My Agent <user@gmail.com>'
};
```

---

## 5. Open Questions

1. **IDLE vs Polling**
   - Should we support IMAP IDLE for real-time notifications?
   - Adds complexity (persistent connection, reconnection logic)
   - Recommendation: Start with polling via Heartbeat; add IDLE later if needed

2. **OAuth2 Support**
   - Gmail and Outlook prefer OAuth2 over App Passwords
   - Requires token refresh flow
   - Recommendation: Start with App Passwords; add OAuth2 as enhancement

3. **Folder/Label Support**
   - Should we support fetching from folders other than INBOX?
   - Gmail uses labels (X-GM-EXT-1 extension)
   - Recommendation: Start with INBOX only; add folder support later

4. **Attachment Storage**
   - Where to store attachments temporarily?
   - Memory (Buffer) vs filesystem vs object storage
   - Recommendation: Buffer in memory for small attachments; stream large ones

5. **Rate Limiting**
   - Gmail has rate limits (500 emails/day for regular accounts)
   - Should the Bay handle rate limiting?
   - Recommendation: Let caller handle; Bay reports errors

6. **Email Threading**
   - Should we maintain conversation threads?
   - IMAP doesn't natively track threads (References/In-Reply-To headers)
   - Recommendation: Basic reply support; full threading is complex

7. **Security**
   - How to securely store email credentials?
   - Recommendation: Environment variables, encrypted config, or secrets manager

---

## 6. Summary

| Aspect | Decision |
|--------|----------|
| **Approach** | BUILD (library stack) |
| **IMAP Library** | imapflow |
| **SMTP Library** | nodemailer |
| **Parsing** | mailparser |
| **Effort** | Medium (1-2 days for core, + polish) |
| **Risk** | Low (all libraries are mature, well-documented) |
| **Stack Fit** | Excellent (pure TypeScript, no external deps) |

Unlike RSS where Miniflux provides a complete solution, email requires building a thin integration layer on top of excellent Node.js libraries. The good news: `imapflow`, `nodemailer`, and `mailparser` are all maintained by the same author (Andris Reinman), are battle-tested in production, and integrate seamlessly.

The Email Bay will be a pure TypeScript package with no external container dependencies, making it lightweight and easy to test.
