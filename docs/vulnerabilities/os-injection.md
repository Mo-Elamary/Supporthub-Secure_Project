# OS Command Injection Vulnerability

## Vulnerability Summary

| Field | Details |
|---|---|
| Application | SupportHub — Vulnerable Edition |
| Vulnerability | OS Command Injection |
| Severity | Critical |
| CWE | CWE-78 |
| Affected Feature | Network Diagnostics |
| Affected Endpoint | `POST /api/tools/ping` |
| Authentication Required | Yes |
| Testing Environment | Local Windows training environment |

## Description

The SupportHub Network Diagnostics feature allows a support agent to enter a hostname or IP address and execute a connectivity test.

The application directly concatenates the user-controlled `host` value into an operating-system command. The completed command is then executed through a system shell.

An attacker can include shell-control characters in the hostname to execute an additional operating-system command.

## Affected Endpoint

```text
POST /api/tools/ping
```

## Affected File

```text
src/routes/tool.routes.js
```

## Preconditions

- SupportHub is running on the local training machine.
- The tester is signed in to a valid SupportHub account.
- The test is performed only in the authorized local environment.
- Only harmless demonstration commands are used.

## Normal Functionality Test

1. Start SupportHub:

   ```powershell
   npm run dev
   ```

2. Open:

   ```text
   http://127.0.0.1:3000
   ```

3. Sign in using a demonstration account.

4. Open `Diagnostics` from the sidebar.

5. Enter the following value:

   ```text
   127.0.0.1
   ```

6. Click `Run diagnostic`.

7. Observe that the server returns the normal ping result.

## Command Injection Test

Enter the following harmless test payload:

```text
127.0.0.1 & echo OS_INJECTION_CONFIRMED
```

Click:

```text
Run diagnostic
```

## Observed Result

The application first executes the expected ping command and then executes the additional `echo` command.

The diagnostic output contains:

```text
OS_INJECTION_CONFIRMED
```

This confirms that user-controlled input can modify the operating-system command executed by the server.

## Network Evidence

The browser sends a request similar to:

```http
POST /api/tools/ping
Content-Type: application/json
```

Request body:

```json
{
  "host": "127.0.0.1 & echo OS_INJECTION_CONFIRMED"
}
```

The response contains the constructed command and its output:

```json
{
  "command": "ping -n 3 127.0.0.1 & echo OS_INJECTION_CONFIRMED",
  "output": "... OS_INJECTION_CONFIRMED ...",
  "exitCode": 0
}
```

## Expected Secure Behavior

The application should accept only a valid hostname or IP address.

Shell-control characters such as `&`, `;`, `|`, command substitution, redirection characters, and newline characters should not be interpreted as part of an operating-system command.

The application should execute `ping` directly using a safe argument array without invoking a command shell.

## Vulnerable Code

The application constructs a shell command using user-controlled input:

```js
const pingFlag = process.platform === 'win32' ? '-n 3' : '-c 3';

const command = `ping ${pingFlag} ${host}`;

exec(command, {
  timeout: 5000,
  maxBuffer: 64 * 1024
}, (error, stdout, stderr) => {
  if (error && !stdout) return next(error);

  res.json({
    command,
    output: stdout || stderr,
    exitCode: error?.code || 0
  });
});
```

## Root Cause

The vulnerability is caused by two unsafe behaviors:

1. Untrusted user input is concatenated directly into a command string.
2. The command string is passed to `exec()`, which executes it through the operating-system shell.

Because the shell interprets special characters, the user can append another command to the expected ping operation.

## Security Impact

An attacker who successfully exploits this vulnerability may be able to:

- Execute arbitrary operating-system commands.
- Read application or system files.
- Access environment information.
- Modify or delete application data.
- Run programs with the permissions of the Node.js process.
- Use the affected server as an entry point for further attacks.

For this reason, OS Command Injection is considered a critical vulnerability.

## Evidence

### Diagnostic Output

![OS Injection diagnostic output](../screenshots/os-injection-diagnostic-output.png)

### Network Response

![OS Injection network response](../screenshots/os-injection-network-response.png)

## Recommended Remediation

The secured edition should:

1. Validate the input as a hostname or IP address using a strict allowlist.
2. Reject shell-control characters and unexpected whitespace.
3. Avoid constructing commands using string concatenation.
4. Replace `exec()` with `execFile()` or `spawn()`.
5. Pass the hostname as a separate argument.
6. Execute the process without a command shell.
7. Apply timeouts and output-size limits.
8. Run the application using a restricted operating-system account.
9. Avoid returning the constructed server command to the browser.

A safer implementation would follow this pattern:

```js
execFile(
  'ping',
  [pingCountFlag, pingCount, validatedHost],
  {
    timeout: 5000,
    maxBuffer: 64 * 1024,
    shell: false
  },
  callback
);
```

Input validation is still required even when `execFile()` is used.

## Verification Criteria for the Secured Edition

The vulnerability will be considered fixed when:

- Normal hostnames and IP addresses can still be tested.
- The application rejects invalid host values.
- Shell-control characters cannot execute additional commands.
- The ping process is executed without a shell.
- The command string is not returned in the API response.
- The test payload is rejected and `OS_INJECTION_CONFIRMED` does not appear.

## Conclusion

The OS Command Injection vulnerability was successfully reproduced in the SupportHub vulnerable edition.

The harmless `echo` payload demonstrated that the Network Diagnostics feature executed an additional operating-system command supplied through the hostname field.