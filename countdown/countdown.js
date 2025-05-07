const { app,Menu,Tray,Notification } = require('electron')
global._ = require('underscore');

function show_time(time_value){
  let minute=parseInt(time_value/60)
  let second=time_value-(minute*60)
  let show_time_str=''
  show_time_str=minute.toString()+':'
  if(second<10){
    show_time_str+='0'+second.toString()
  }else{
      show_time_str+=second.toString()
  }
  tray.setTitle(show_time_str)

}
function console_log(str){
    console.log(str)
    new Notification("title", { body: console_log})

}
function start_count_time(time_value){
    show_time(time_value)
  if(time_value==0){
    console_log("Time is zero")
    tray.setTitle('')
  }else{
    time_value-=1
    setTimeout(start_count_time, 1000,time_value);
  }
}
function time_start(minute){
    start_count_time(parseInt(minute) *60)
}

const template = [
            {label: '42minute',
                click(){
                    time_start(42)
                }
            },
            {label: '47minute',
                click(){
                    time_start(47)
                }
            },
            {label: '27minute',
                click(){
                    time_start(27)
                }
            },
            {label: '17minute',
                click(){
                    time_start(17)
                }
            },
            {label: '-------',
                click(){
                }
            },
            {label: 'Quit',
                click(){
                    app.quit()
                }
            },
]
let tray = null
app.whenReady().then(() => {
  tray = new Tray()
  tray.setContextMenu(Menu.buildFromTemplate(template))
})


