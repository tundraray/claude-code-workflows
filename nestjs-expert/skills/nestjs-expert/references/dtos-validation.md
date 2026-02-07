# DTOs & Validation — Advanced Patterns

> NestJS 10+ | class-validator 0.14+ | class-transformer 0.5+

## @ValidateIf() — Conditional Validation

Validate a field only when another field has a specific value. Avoids separate DTOs for minor variations.

```typescript
export class CreatePaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  // Only required for card payments — skip validation entirely for bank transfers
  @ValidateIf((o) => o.method === PaymentMethod.CARD)
  @IsString()
  @Matches(/^\d{13,19}$/, { message: 'Invalid card number' })
  cardNumber?: string;

  @ValidateIf((o) => o.method === PaymentMethod.BANK_TRANSFER)
  @IsIBAN()
  iban?: string;

  @ValidateIf((o) => o.method === PaymentMethod.CARD)
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/)
  expiryDate?: string;
}
```

**When NOT to use @ValidateIf**: When the conditional logic is complex (3+ branches, nested conditions). Use discriminated unions with `@Type()` instead — they give you compile-time type safety.

**Failure mode**: `@ValidateIf()` checks run before other decorators on the same property. If the condition returns `false`, ALL validators on that property are skipped — including `@IsOptional()`. This means the property can be present with any value without validation.

---

## Validation Groups — Different Rules for Create vs Update

```typescript
export class UserDto {
  @IsUUID(4, { groups: ['update'] })
  id?: string;

  @IsEmail({}, { always: true })  // 'always' means all groups
  email: string;

  @IsString({ groups: ['create'] })
  @MinLength(8, { groups: ['create'] })
  password?: string;

  @IsString({ always: true })
  @MinLength(2, { always: true })
  name: string;
}

// Endpoint-specific validation pipe with group
@Post()
create(
  @Body(new ValidationPipe({ groups: ['create'] }))
  dto: UserDto,
) { ... }

@Patch(':id')
update(
  @Body(new ValidationPipe({ groups: ['update'] }))
  dto: UserDto,
) { ... }
```

**Trade-off vs PartialType/OmitType**:
- Groups: One DTO class, less duplication, but runtime-only enforcement (no compile-time safety)
- Separate DTOs: More files, but TypeScript catches misuse at compile time
- **Recommendation**: Use separate DTOs for public APIs (better OpenAPI docs), groups for internal/admin APIs with many overlapping fields

---

## Async Validators

For validation that requires database or external service lookup (uniqueness checks, reference validation).

```typescript
@ValidatorConstraint({ async: true })
@Injectable()
export class IsUniqueEmailConstraint implements ValidatorConstraintInterface {
  constructor(private readonly usersRepo: UsersRepository) {}

  async validate(email: string): Promise<boolean> {
    const existing = await this.usersRepo.findByEmail(email);
    return !existing;
  }

  defaultMessage(): string {
    return 'Email $value is already registered';
  }
}

export function IsUniqueEmail(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsUniqueEmailConstraint,
    });
  };
}

// Register the constraint as a NestJS provider so DI works
@Module({
  providers: [IsUniqueEmailConstraint],
})
export class ValidationModule {
  constructor(private moduleRef: ModuleRef) {
    // Bridge NestJS DI to class-validator
    useContainer(moduleRef, { fallbackOnErrors: true });
  }
}
```

**Critical**: You must call `useContainer()` from `class-validator` to bridge NestJS DI into the validation layer. Without it, the constraint is instantiated without DI and `usersRepo` is `undefined`.

**Performance**: Async validators run on every request for every field they decorate. A uniqueness check adds a DB query per request. Consider rate limiting or moving uniqueness enforcement to the service layer with proper DB constraints (UNIQUE index + catch 23505).

**When NOT to use async validators**: High-throughput endpoints (>500 RPS). The DB round-trip adds 1-5ms per validator. Use database constraints instead and handle the conflict in the service.

---

## Response DTOs — Separating Input from Output

Never return entity objects directly. Use `@Exclude()` with `ClassSerializerInterceptor` or explicit response DTOs.

### Option 1: ClassSerializerInterceptor (NestJS built-in)

```typescript
// user.entity.ts
export class User {
  id: string;
  email: string;

  @Exclude()  // Never serialized in responses
  password: string;

  @Exclude()
  deletedAt: Date | null;

  @Expose({ groups: ['admin'] })  // Only visible to admins
  loginAttempts: number;

  @Transform(({ value }) => value?.toISOString())
  createdAt: Date;
}

// Enable globally
app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

// Controller — specify serialization groups per endpoint
@Get(':id')
@SerializeOptions({ groups: ['admin'] })
findOneAsAdmin(@Param('id') id: string) { ... }
```

**Trade-off**: `ClassSerializerInterceptor` operates on the entity class, coupling your API contract to your ORM model. Any column rename changes the API response.

### Option 2: Explicit Response DTOs (recommended for public APIs)

```typescript
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ obj }) => `${obj.firstName} ${obj.lastName}`)
  displayName: string;
}

// Mapping in service or a dedicated mapper
function toUserResponse(entity: User): UserResponseDto {
  return plainToInstance(UserResponseDto, entity, {
    excludeExtraneousValues: true,  // Only @Expose() fields included
  });
}
```

**When NOT to use ClassSerializerInterceptor**: When you need different response shapes for the same entity (list vs detail, admin vs user). Use explicit DTOs with dedicated mappers.

---

## Discriminated Unions — Polymorphic DTOs

For endpoints that accept multiple payload types (notification settings, webhook events, payment methods).

```typescript
// Base class
class NotificationConfigBase {
  @IsEnum(NotificationType)
  type: NotificationType;
}

class EmailNotificationConfig extends NotificationConfigBase {
  type: NotificationType.EMAIL;

  @IsEmail()
  recipient: string;

  @IsString()
  @MaxLength(200)
  subject: string;
}

class SlackNotificationConfig extends NotificationConfigBase {
  type: NotificationType.SLACK;

  @IsUrl()
  webhookUrl: string;

  @IsString()
  channel: string;
}

class WebhookNotificationConfig extends NotificationConfigBase {
  type: NotificationType.WEBHOOK;

  @IsUrl()
  url: string;

  @IsObject()
  @IsOptional()
  headers?: Record<string, string>;
}

// Parent DTO using @Type with discriminator
export class CreateAlertDto {
  @IsString()
  name: string;

  @ValidateNested()
  @Type(() => NotificationConfigBase, {
    discriminator: {
      property: 'type',
      subTypes: [
        { value: EmailNotificationConfig, name: NotificationType.EMAIL },
        { value: SlackNotificationConfig, name: NotificationType.SLACK },
        { value: WebhookNotificationConfig, name: NotificationType.WEBHOOK },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  notification: EmailNotificationConfig | SlackNotificationConfig | WebhookNotificationConfig;
}
```

**Failure mode**: Forgetting `keepDiscriminatorProperty: true` strips the `type` field after transformation, so the downstream code cannot determine which subtype was selected.

**Failure mode**: The discriminator property value must match exactly (case-sensitive). If the enum uses `EMAIL` but the client sends `email`, it falls back to the base class and no subtype validators run.

---

## Global Validation Pipe — Production Configuration

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,             // Strip unknown properties
    forbidNonWhitelisted: true,  // Throw 400 on unknown properties
    transform: true,             // Auto-transform to DTO instance
    transformOptions: {
      enableImplicitConversion: true,
    },
    // Limit validation errors to prevent abuse (sending 10k invalid fields)
    validationError: {
      target: false,   // Do not include the target object in error response
      value: false,    // Do not include the invalid value (prevents PII leaking)
    },
    stopAtFirstError: false,     // Return all errors, not just the first
    exceptionFactory: (errors) => {
      // Custom error shaping for consistent API response format
      const messages = errors.flatMap((err) =>
        Object.values(err.constraints || {}),
      );
      return new BadRequestException({
        statusCode: 400,
        error: 'Validation Failed',
        messages,
      });
    },
  }),
);
```

**Trade-off of `enableImplicitConversion`**: Converts `"123"` to `123` for `@IsInt()` properties, which is convenient for query params. But it also converts `"true"` to `true` for any `@IsBoolean()`, and `""` to `0` for numbers. This causes subtle bugs when optional number fields receive empty strings. Prefer explicit `@Transform()` on individual fields for critical validation.
