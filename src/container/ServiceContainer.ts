/**
 * ServiceContainer — Lightweight lazy service locator.
 *
 * Replaces declaration-order-dependent flat `const` singletons in index.ts.
 * Each service is registered with a factory; construction is deferred until
 * first resolve() call, so circular-lookups throw immediately instead of
 * producing undefined references.
 *
 * Concern 1 fix from docs/final/concerns.md:
 * - Initialization order is the container's responsibility, not declaration order.
 * - No more `as any` casts — types flow through resolve<T>().
 * - No more nullable setXxx() fields — services receive collaborators at construction time.
 */

type Factory<T> = () => T;

export class ServiceContainer {
  private readonly factories = new Map<string, Factory<unknown>>();
  private readonly instances = new Map<string, unknown>();
  private readonly resolving = new Set<string>(); // cycle guard

  register<T>(key: string, factory: Factory<T>): void {
    this.factories.set(key, factory as Factory<unknown>);
  }

  resolve<T>(key: string): T {
    if (this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    if (this.resolving.has(key)) {
      throw new Error(
        `ServiceContainer: circular dependency detected for "${key}". ` +
        `Resolving chain: [${[...this.resolving].join(' → ')} → ${key}]`
      );
    }

    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(
        `ServiceContainer: no factory registered for "${key}". ` +
        `Did you forget to call container.register("${key}", ...)?`
      );
    }

    this.resolving.add(key);
    try {
      const instance = factory();
      this.instances.set(key, instance);
      return instance as T;
    } finally {
      this.resolving.delete(key);
    }
  }

  /** Returns true if a service has been registered (not necessarily constructed). */
  has(key: string): boolean {
    return this.factories.has(key);
  }

  /** Clears all instances and registrations. For testing only. */
  reset(): void {
    this.instances.clear();
    this.factories.clear();
    this.resolving.clear();
  }
}

/** Process-scoped singleton container. Import this to register or resolve services. */
export const container = new ServiceContainer();
