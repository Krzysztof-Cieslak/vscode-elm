import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as utils from './elmUtils';
import * as readline from 'readline';

interface IElmIssue {
  tag: string;
  overview: string;
  subregion: string;
  details: string;
  region: {
    start: { line: number; column: number; }
    end: { line: number; column: number; }
  };
  type: string;
  file: string;
}

function severityStringToDiagnosticSeverity(severity: string): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error': return vscode.DiagnosticSeverity.Error;
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    default: return vscode.DiagnosticSeverity.Error;
  }
}

function elmMakeIssueToDiagnostic(issue: IElmIssue): vscode.Diagnostic {
  let lineRange: vscode.Range = new vscode.Range(
    issue.region.start.line - 1,
    issue.region.start.column - 1,
    issue.region.end.line - 1,
    issue.region.end.column - 1
  );
  return new vscode.Diagnostic(
    lineRange,
    issue.overview + ' - ' + issue.details.replace(/\[\d+m/g, ''),
    severityStringToDiagnosticSeverity(issue.type)
  );
}

function checkForErrors(filename): Promise<IElmIssue[]> {
  return new Promise((resolve, reject) => {
    const cwd: string = utils.detectProjectRoot(filename) || vscode.workspace.rootPath;
    let make: cp.ChildProcess;
    const args = [filename, '--report', 'json', '--output', '/dev/null'];
    if (utils.isWindows) {
      make = cp.exec('elm-make ' + args.join(' '), { cwd: cwd });
    }
    else {
      make = cp.spawn('elm-make', args, { cwd: cwd });
    }
    // output is actually optional
    // (fixed in https://github.com/Microsoft/vscode/commit/b4917afe9bdee0e9e67f4094e764f6a72a997c70,
    // but unreleased at this time)
    const stdoutlines: readline.ReadLine = readline.createInterface({ input: make.stdout, output: undefined });
    const lines: IElmIssue[] = [];
    stdoutlines.on('line', (line: string) => {
      // Ignore compiler success.
      if (line.startsWith("Successfully generated")) {
        return;
      }
      // Elm writes out JSON arrays of diagnostics, with one array per line.
      // Multiple lines may be received.
      lines.push(...<IElmIssue[]>JSON.parse(line))
    });
    const stderr: Buffer[] = [];
    make.stderr.on('data', (data: Buffer) => {
      if (data) {
        stderr.push(data);
      }
    });
    make.on('error', (err: Error) => {
      stdoutlines.close();
      if (err && (<any>err).code === 'ENOENT') {
        vscode.window.showInformationMessage("The 'elm-make' compiler is not available.  Install Elm from http://elm-lang.org/.");
        resolve([]);
      } else {
        reject(err);
      }
    });
    make.on('close', (code: number, signal: string) => {
      stdoutlines.close();
      if (stderr.length) {
        let errorResult: IElmIssue = {
          tag: 'error',
          overview: '',
          subregion: '',
          details: Buffer.concat(stderr).toString(),
          region: {
            start: {
              line: 1,
              column: 1
            },
            end: {
              line: 1,
              column: 1
            }
          },
          type: 'error',
          file: filename
        };
        resolve([errorResult]);
      } else {
        resolve(lines);
      }
    });
  });
}

export function runLinter(document: vscode.TextDocument): void {
  if (document.languageId !== 'elm') {
    return;
  }
  let diagnostics: vscode.Diagnostic[] = [];
  let compileErrors: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('elm');
  let uri: vscode.Uri = document.uri;

  checkForErrors(uri.fsPath)
    .then((compilerErrors: IElmIssue[]) => {
      diagnostics = compilerErrors.map((error) => elmMakeIssueToDiagnostic(error));
      compileErrors.set(document.uri, diagnostics);
    })
    .catch((error) => {
      compileErrors.set(document.uri, []);
    });
}
