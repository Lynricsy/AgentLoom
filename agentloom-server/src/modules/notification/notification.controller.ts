import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller()
export class NotificationController {}
