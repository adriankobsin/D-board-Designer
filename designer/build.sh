#!/bin/bash
cd /home/claude/boardline
python3 mki18n.py
{ cat head.html; echo '<style>'; cat style.css; echo '</style>'; cat body.html; echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'; echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'; echo '<script>'; cat calc.js seed.js i18n.js i18n-data.js tools.js ui.js; echo '</script>'; } > page.html
