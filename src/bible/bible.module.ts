import { Module } from '@nestjs/common';
import { BibleService } from './bible.service.js';

@Module({
  providers: [BibleService],
  exports: [BibleService],
})
export class BibleModule {}
