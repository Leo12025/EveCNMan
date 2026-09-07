import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoService } from './crypto.service';
import { EveAccount, setEveAccountCrypto } from './entities/eve-account.entity';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CommonModule implements OnModuleInit {
  constructor(private readonly crypto: CryptoService) {}
  onModuleInit() {
    setEveAccountCrypto(this.crypto);
  }
}
