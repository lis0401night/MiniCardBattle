const fs = require('fs');
const path = require('path');

const DIRS = [
    'e:/project_arakia/projects/MiniCardBattle/src/pages',
    'e:/project_arakia/projects/MiniCardBattle/src/components'
];

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // We look for button tags that contain '戻る' inside
    // Example: <button className="btn" style={{...}} onClick={() => switchScreen('screen-mode-select')}>戻る</button>
    // We want to capture the onClick handler and inject playSound if it's missing.

    const regex = /<button([^>]*?)onClick=\{([^}]+)\}([^>]*)>戻る<\/button>/g;
    
    content = content.replace(regex, (match, beforeOnClick, onClickContent, afterOnClick) => {
        // onClickContent might be like `() => switchScreen('screen-mode-select')`
        // or `handleCancel`
        // or `window.closeExchangeDetailModal`

        let funcBody = onClickContent.trim();
        
        // Skip if it already has playSound or calls a function that handles sound
        if (funcBody.includes('playSound') || 
            funcBody.includes('goBackFrom') || 
            funcBody.includes('goToModeSelect')) {
            return match; // No change
        }

        // We need to inject window.playSound?.(window.SOUNDS?.seClick);
        let newOnClick = '';
        
        // If it's a simple function reference like `handleCancel`
        if (/^[a-zA-Z0-9_\.]+$/.test(funcBody)) {
            newOnClick = `{(e) => { window.playSound?.(window.SOUNDS?.seClick); ${funcBody}(e); }}`;
        } 
        // If it's an arrow function like `() => switchScreen(...)`
        else if (funcBody.startsWith('() =>') || funcBody.match(/^\(?[a-zA-Z0-9_]*\)?\s*=>/)) {
            // Check if it has block body
            const bodyMatch = funcBody.match(/^(\(?[a-zA-Z0-9_]*\)?\s*=>)\s*\{([\s\S]*)\}$/);
            if (bodyMatch) {
                // It has {} block
                newOnClick = `{${bodyMatch[1]} { window.playSound?.(window.SOUNDS?.seClick); ${bodyMatch[2]} }}`;
            } else {
                // It's a one-liner like `() => switchScreen(..)`
                const arrowMatch = funcBody.match(/^(\(?[a-zA-Z0-9_]*\)?\s*=>)\s*(.*)$/);
                newOnClick = `{${arrowMatch[1]} { window.playSound?.(window.SOUNDS?.seClick); ${arrowMatch[2]} }}`;
            }
        } else {
            // Unknown structure, just wrap it in a new block
            newOnClick = `{() => { window.playSound?.(window.SOUNDS?.seClick); ${funcBody} }}`;
        }

        changed = true;
        console.log(`Modified: ${path.basename(filePath)}`);
        console.log(`  From: onClick={${onClickContent}}`);
        console.log(`  To:   onClick=${newOnClick}`);
        
        return `<button${beforeOnClick}onClick=${newOnClick}${afterOnClick}>戻る</button>`;
    });

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
        } else if (file.endsWith('.jsx')) {
            processFile(fullPath);
        }
    }
}

DIRS.forEach(scanDir);
console.log("Done");
