const { ipcRenderer } = require('electron');

// 函数：加载 Markdown 内容
async function loadMarkdown(filePath) {
  const contentDiv = document.getElementById('markdown-content');
  const buttons = document.querySelectorAll('.nav-button');
  contentDiv.innerHTML = '<p>加载中...</p>'; // 显示加载提示
  
  // 移除所有按钮的 active 类
  buttons.forEach(btn => btn.classList.remove('active'));
  // 给当前按钮添加 active 类
  // Use template literal within the renderer script
  var selector = `.nav-button[data-filepath="${filePath}"]`; 
  const currentButton = document.querySelector(selector);
  if (currentButton) {
    currentButton.classList.add('active');
    // Optional: Highlight parent submenu title
  }

  try {
    // Request main process to read and render the file
    const htmlContent = await ipcRenderer.invoke('read-markdown-file', filePath);
    contentDiv.innerHTML = htmlContent;
  } catch (error) {
    console.error('Error loading markdown:', error);
    // Use string concatenation for error message HTML to avoid nested template literals
    const errorMessageHTML = '<p style="color: red;">错误：无法加载文件 ' + filePath + '. ' + (error.message || '') + '</p>';
    contentDiv.innerHTML = errorMessageHTML;
  }
}

// Add event listeners to navigation buttons
document.querySelectorAll('.nav-button').forEach(button => {
  button.addEventListener('click', (event) => {
    // Use currentTarget to ensure we get the button itself
    const filePath = event.currentTarget.dataset.filepath;
    if (filePath) {
      loadMarkdown(filePath);
    }
  });
});

// Load initial content after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
   const firstLevel2Button = document.querySelector('.nav-button.level-2'); // Find the first level-2 button
   if (firstLevel2Button) {
      const firstFilePath = firstLevel2Button.dataset.filepath;
      if(firstFilePath) {
         console.log('Loading initial content for:', firstFilePath);
         loadMarkdown(firstFilePath);
      } else {
         console.log('First level-2 button found, but no filepath data.');
         document.getElementById('markdown-content').innerHTML = '<p>无法找到初始文件路径。</p>';
      }
   } else {
       console.log('No level-2 navigation buttons found.');
       // Keep or modify the default message
       // document.getElementById('markdown-content').innerHTML = '<p>没有可用的导航项。</p>';
   }
});