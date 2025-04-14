# <p align="center">Power by Hương Đá Group 🇻🇳 </p>

<p align="center">
  <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/tien-thuy/imap-server/tests.yml"/>
  <a href="https://www.npmjs.com/package/lexical">
    <img alt="Visit the NPM page" src="https://img.shields.io/npm/v/@tien-thuy/imap-server"/>
  </a>
</p>

# Tien Thủy / IMAP Server

Provide a simple imap server. Ready for production.

# Requirements

Node --- >= v20 or newer

# Installation

```bash
npm install @tien-thuy/imap-server
```

# Usage

```typescript
import IMAP from '@tien-thuy/imap-server';

const imapServer = new IMAPServer({
  host: '127.0.0.1',
  port: 2208,
  TLSOptions: {
    enable: false
  }
});
```

# Options

| Name                  | Required                                  | Type       | Default value                | Description                                                                                                                                                                                         |
|-----------------------|-------------------------------------------|------------|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `host`                | `true`                                    | `string`   |                              | Hostname of your server, default is `localhost`                                                                                                                                                     |
| `port`                | `true`                                    | `number`   |                              | Port to listen on, default is `2208`                                                                                                                                                                |
| `welcomeMessage`      | `false`                                   | `string`   | `Welcome to my IMAP server!` | Welcome message sent to clients upon successful connection.                                                                                                                                         |
| `TLSOptions`.`enable` | `false`                                   | `boolean`  | `false`                      | Enable TLS support, default is `false`. If you want to use TLS, please provide a certificate and key file path in `TLSOptions.certPath` and `TLSOptions.keyPath`, otherwise it will throw an error. |
| `TLSOptions`.`key`    | `true` if `TLSOptions`.`enable` is `true` | `string`   | `0`                          | Path to private key file, required if `enable` is true                                                                                                                                              |
| `TLSOptions`.`cert`   | `true` if `TLSOptions`.`enable` is `true` | `string`   | `0`                          | Path to public certificate file, required if `enable` is true                                                                                                                                       |
| `TLSOptions`.`ca`     | `true` if `TLSOptions`.`enable` is `true` | `string`   | `0`                          | Path to CA certificate file, optional if `enable` is true                                                                                                                                           |
| `idleTimeout`         | `false`                                   | `number`   | `0`                          | Timeout in milliseconds after which the server will automatically disconnect idle connections. Default is `60000` (1 minute).                                                                       |
| `maxConnections`      | `false`                                   | `number`   | `unlimited`                  | Maximum number of concurrent connections allowed. Default is `50`.                                                                                                                                  |
| `idLength`            | `false`                                   | `number`   |                              | Length of generated unique IDs. Default is `32`.                                                                                                                                                    |
| `storage`             | `false`                                   | `object`   |                              | Storage options. See [Storage](#storage) section below for details.                                                                                                                                 |
| `storage`.`get`       | `false`                                   | `function` |                              | Function that returns a storage instance. This can be used to customize how messages are stored and retrieved.                                                                                      |
| `storage`.`set`       | `false`                                   | `function` |                              | Function that stores a message. This can be used to customize how messages are stored and retrieved.                                                                                                |
| `storage`.`destroy`   | `false`                                   | `function` |                              | Function that deletes a message. This can be used to customize how messages are deleted.                                                                                                            |
| `storage`.`list`      | `false`                                   | `function` |                              | Function that lists all messages. This can be used to customize how messages are listed.                                                                                                            |

# Events

| Event Name         | Parameters                                                                                                                  | Description                                                                      |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| `connect`          | `event: { id: string; remoteAddress: string; secure: boolean }`                                                             | Emitted when a new connection is established.                                    |
| `close`            | None                                                                                                                        | Emitted when the server is closed.                                               |
| `LOGIN`            | `event: { connection: IMAPConnection; username: string; password: string; auth: (success: boolean) => void; }, tag: string` | Emitted when a login attempt is made. Use `auth` to approve or deny the login.   |
| `LOGOUT`           | `event: IMAPConnection, tag: string`                                                                                        | Emitted when a logout command is received.                                       |
| `SELECT`           | `connection: IMAPConnection, callback: (exists: boolean, flags: string[]) => void, tag: string`                             | Emitted when a mailbox is selected. Use `callback` to provide mailbox status.    |
| `data`             | `event: { connection: IMAPConnection; data: Buffer }`                                                                       | Emitted when data is received from a connection.                                 |
| `timeout`          | `event: IMAPConnection`                                                                                                     | Emitted when a connection times out.                                             |
| `listening`        | `info: { address: string; port: number; secure: boolean }`                                                                  | Emitted when the server starts listening for connections.                        |
| `error`            | `error: Error`                                                                                                              | Emitted when an error occurs.                                                    |
| `CAPABILITY`       | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a capability command is received.                                   |
| `LIST`             | `connection: IMAPConnection, callback: (mailboxes: { name: string; child: boolean; }[]) => void, tag: string`               | Emitted when a list command is received. Use `callback` to provide mailbox list. |
| `connection:close` | `connection: IMAPConnection`                                                                                                | Emitted when a connection is closed.                                             |
| `command`          | `event: { connection: IMAPConnection, command: string, args: string[] }`                                                    | Emitted when a command is received.                                              |
| `CREATE`           | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a create command is received.                                       |
| `EXAMINE`          | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when an examine command is received.                                     |
| `DELETE`           | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a delete command is received.                                       |
| `RENAME`           | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a rename command is received.                                       |
| `SUBSCRIBE`        | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a subscribe command is received.                                    |
| `UNSUBSCRIBE`      | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when an unsubscribe command is received.                                 |
| `STATUS`           | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a status command is received.                                       |
| `APPEND`           | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when an append command is received.                                      |
| `CHECK`            | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a check command is received.                                        |
| `CLOSE`            | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a close command is received.                                        |
| `EXPUNGE`          | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when an expunge command is received.                                     |
| `SEARCH`           | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a search command is received.                                       |
| `FETCH`            | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a fetch command is received.                                        |
| `STORE`            | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a store command is received.                                        |
| `COPY`             | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a copy command is received.                                         |
| `MOVE`             | `connection: IMAPConnection, tag: string`                                                                                   | Emitted when a move command is received.                                         |
