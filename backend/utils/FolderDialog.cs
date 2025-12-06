using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class FolderDialog
{
    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    private static extern int SHBrowseForFolder(ref BROWSEINFO lpbi);

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    private static extern bool SHGetPathFromIDList(IntPtr pidl, IntPtr pszPath);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct BROWSEINFO
    {
        public IntPtr hwndOwner;
        public IntPtr pidlRoot;
        public IntPtr pszDisplayName;
        [MarshalAs(UnmanagedType.LPTStr)]
        public string lpszTitle;
        public uint ulFlags;
        public IntPtr lpfn;
        public IntPtr lParam;
        public int iImage;
    }

    public static string ShowDialog(string title)
    {
        BROWSEINFO bi = new BROWSEINFO();
        bi.lpszTitle = title;
        bi.ulFlags = 0x0040; // BIF_NEWDIALOGSTYLE
        
        IntPtr pidl = (IntPtr)SHBrowseForFolder(ref bi);
        if (pidl != IntPtr.Zero)
        {
            IntPtr path = Marshal.AllocHGlobal(260);
            if (SHGetPathFromIDList(pidl, path))
            {
                string result = Marshal.PtrToStringAuto(path);
                Marshal.FreeHGlobal(path);
                Marshal.FreeCoTaskMem(pidl);
                return result;
            }
            Marshal.FreeHGlobal(path);
            Marshal.FreeCoTaskMem(pidl);
        }
        return null;
    }
}



