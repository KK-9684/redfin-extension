export class NOTIFICATION_TYPES {
  static INFO = "info";
  static SUCCESS = 'success';
  static WARNING = 'warning';
  static ERROR = 'error';
}

export class NotificationService {
  static containerElm = null;
  TIME_TO_DISPLAY = 5000;
  constructor() {
    this.initNotificationContainer();
  }

  initNotificationContainer() {
    if(!NotificationService.containerElm) {
      NotificationService.containerElm = $('<div class="imh-notification-container"></div>');
      $('body').append(NotificationService.containerElm);
    }
  }

  notify(message, type) {
    
    const notyElm = $('<div class="imh-noty"></div>').text(message);
    NotificationService.containerElm.append(notyElm);

    switch(type) {
      case NOTIFICATION_TYPES.INFO: {
        notyElm.addClass('imh-info');
        break;
      }
      case NOTIFICATION_TYPES.SUCCESS: {
        notyElm.addClass('imh-success');
        break;
      }
      case NOTIFICATION_TYPES.WARNING: {
        notyElm.addClass('imh-warning');
        break;
      }
      case NOTIFICATION_TYPES.ERROR: {
        notyElm.addClass('imh-error');
        break;
      }
      
    }
    setTimeout(() => {
      notyElm.addClass('show');
    }, 50)
    setTimeout(() => {
      notyElm.removeClass('show');
    }, this.TIME_TO_DISPLAY)
    setTimeout(() => {
      notyElm.remove();
    }, this.TIME_TO_DISPLAY + 500)
  }
}