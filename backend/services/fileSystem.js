// backend/services/fileSystem.js
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Apre dialog Windows moderno di Esplora Risorse per selezionare directory
 * Usa IFileOpenDialog COM interface per il dialog moderno con vista dettagliata
 */
export async function selectDirectoryDialog(description = 'Seleziona Directory') {
  if (process.platform !== 'win32') {
    throw new Error('Dialog directory supportato solo su Windows');
  }

  try {
    // Usa FolderBrowserDialog con UseDescriptionForTitle per ottenere dialog più moderno
    // Su Windows 10/11 questo mostra un dialog migliorato rispetto al vecchio
    const psScript = `
$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName System.Windows.Forms
  
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "${description.replace(/"/g, '`"').replace(/\$/g, '`$')}"
  $dialog.ShowNewFolderButton = $false
  $dialog.UseDescriptionForTitle = $true
  $dialog.RootFolder = [System.Environment+SpecialFolder]::MyComputer
  
  # Su Windows 10/11, questo dovrebbe mostrare un dialog più moderno
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
  }
  
  $dialog.Dispose()
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `;

    // Salva script in un file temporaneo
    const tempFile = path.join(os.tmpdir(), `g2a-dialog-${Date.now()}.ps1`);
    await fs.writeFile(tempFile, psScript, 'utf8');

    try {
      // Esegui PowerShell
      const psCommand = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tempFile}"`;
      
      const { stdout, stderr } = await execAsync(
        psCommand,
        { 
          timeout: 120000,
          windowsHide: false,
          maxBuffer: 1024 * 1024,
          shell: false
        }
      );

      // Rimuovi file temporaneo
      await fs.unlink(tempFile).catch(() => {});

      const selectedPath = stdout.trim();
      
      if (stderr && stderr.trim() && !selectedPath) {
        console.log('PowerShell stderr:', stderr);
      }

      return selectedPath || null;
    } catch (execError) {
      await fs.unlink(tempFile).catch(() => {});
      
      if (execError.code === 'ETIMEDOUT') {
        console.log('Dialog timeout');
        return null;
      }
      
      console.error('Errore esecuzione PowerShell:', execError);
      // Fallback al metodo semplice se il COM interface non funziona
      return await selectDirectoryDialogFallback(description);
    }
  } catch (error) {
    console.error('Errore dialog Windows:', error);
    // Fallback al metodo semplice
    return await selectDirectoryDialogFallback(description);
  }
}

/**
 * Fallback: usa il metodo semplice con FolderBrowserDialog moderno
 */
async function selectDirectoryDialogFallback(description = 'Seleziona Directory') {
  try {
    const psScript = `
$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "${description.replace(/"/g, '`"').replace(/\$/g, '`$')}"
  $dialog.ShowNewFolderButton = $false
  $dialog.UseDescriptionForTitle = $true
  $dialog.RootFolder = [System.Environment+SpecialFolder]::MyComputer
  
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
  }
  
  $dialog.Dispose()
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `;

    const tempFile = path.join(os.tmpdir(), `g2a-dialog-fallback-${Date.now()}.ps1`);
    await fs.writeFile(tempFile, psScript, 'utf8');

    try {
      const psCommand = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tempFile}"`;
      const { stdout, stderr } = await execAsync(
        psCommand,
        { 
          timeout: 120000,
          windowsHide: false,
          maxBuffer: 1024 * 1024,
          shell: false
        }
      );

      await fs.unlink(tempFile).catch(() => {});
      const selectedPath = stdout.trim();
      
      return selectedPath || null;
    } catch (execError) {
      await fs.unlink(tempFile).catch(() => {});
      throw execError;
    }
  } catch (error) {
    console.error('Errore fallback dialog:', error);
    throw error;
  }
}

/**
 * Apre dialog Windows moderno di Esplora Risorse per selezionare file
 * Usa il dialog moderno di Windows 10/11 con vista dettagliata
 */
export async function selectFileDialog(description = 'Seleziona File', filters = 'Tutti i file|*.*') {
  if (process.platform !== 'win32') {
    throw new Error('Dialog file supportato solo su Windows');
  }

  try {
    // Usa Windows Forms OpenFileDialog che su Windows 10/11 usa automaticamente il dialog moderno
    const psScript = `
$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "${description.replace(/"/g, '`"').replace(/\$/g, '`$')}"
  $dialog.Filter = "${filters.replace(/"/g, '`"').replace(/\$/g, '`$')}"
  $dialog.Multiselect = $false
  $dialog.AutoUpgradeEnabled = $true  # Usa il dialog moderno se disponibile
  
  # Imposta lo stile moderno (Windows 10/11)
  $hwnd = [System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle
  if ($hwnd -eq [IntPtr]::Zero) {
    $hwnd = 0
  }
  
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.FileName
  }
  
  $dialog.Dispose()
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `;

    // Salva script in un file temporaneo
    const tempFile = path.join(os.tmpdir(), `g2a-file-dialog-${Date.now()}.ps1`);
    await fs.writeFile(tempFile, psScript, 'utf8');

    try {
      // Esegui PowerShell
      const psCommand = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tempFile}"`;
      
      const { stdout, stderr } = await execAsync(
        psCommand,
        { 
          timeout: 120000,
          windowsHide: false,
          maxBuffer: 1024 * 1024,
          shell: false
        }
      );

      // Rimuovi file temporaneo
      await fs.unlink(tempFile).catch(() => {});

      const selectedPath = stdout.trim();
      
      if (stderr && stderr.trim() && !selectedPath) {
        console.log('PowerShell stderr:', stderr);
      }

      return selectedPath || null;
    } catch (execError) {
      await fs.unlink(tempFile).catch(() => {});
      
      if (execError.code === 'ETIMEDOUT') {
        console.log('Dialog timeout');
        return null;
      }
      
      console.error('Errore esecuzione PowerShell:', execError);
      throw execError;
    }
  } catch (error) {
    console.error('Errore dialog file Windows:', error);
    throw error;
  }
}

/**
 * Verifica se un path esiste ed è una directory
 */
export async function validateDirectory(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Cerca struttura Cypress in una directory
 */
export async function detectCypressStructure(dirPath) {
  const cypressPath = path.join(dirPath, 'cypress');
  const configPath = path.join(dirPath, 'cypress.config.js');
  const packageJsonPath = path.join(dirPath, 'package.json');

  const hasCypressDir = await validateDirectory(cypressPath);
  const hasConfig = await fs.access(configPath).then(() => true).catch(() => false);
  
  let packageJson = null;
  try {
    const content = await fs.readFile(packageJsonPath, 'utf8');
    packageJson = JSON.parse(content);
  } catch {}

  return {
    isValid: hasCypressDir || hasConfig,
    hasCypressDir,
    hasConfig,
    hasPackageJson: !!packageJson,
    cypressVersion: packageJson?.devDependencies?.cypress || packageJson?.dependencies?.cypress || null
  };
}

/**
 * Trova tutti i file .js in una directory ricorsivamente
 */
export async function findJSFiles(rootDir, relativePath = '') {
  const files = [];
  const fullPath = path.join(rootDir, relativePath);

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(relativePath, entry.name);
      const fullEntryPath = path.join(fullPath, entry.name);

      if (entry.isDirectory()) {
        // Skip directory comuni
        if (['node_modules', '.git', 'dist', 'build', '__temp__'].includes(entry.name)) {
          continue;
        }
        files.push(...await findJSFiles(rootDir, entryPath));
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
        files.push({
          relativePath: entryPath,
          fullPath: fullEntryPath
        });
      }
    }
  } catch (error) {
    console.error(`Errore leggendo ${fullPath}:`, error.message);
  }

  return files;
}

