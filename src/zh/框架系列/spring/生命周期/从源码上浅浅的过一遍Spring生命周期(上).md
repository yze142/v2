---
title: 从源码上浅浅的过一遍Spring生命周期
# 图
# cover: /assets/images/cover1.jpg
# 图标
icon: page
---
## 1.扫描流程

一开始我们学习spring都是从new ClassPathXmlApplicationContext("spring.xml");开始，但是随着社会的发展。。。。编不下去了

```java
 AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(AppConfig.class);
//ClassPathXmlApplicationContext context = new ClassPathXmlApplicationContext("spring.xml");
 UserService userService = (UserService) context.getBean("userService");
 userService.test();
```

AnnotationConfigApplicationContext和ClassPathXmlApplicationContext效果都一样，但是前者需要传递一个Class对象

```java
@ComponentScan("com.xiaoyu")
public class AppConfig 
```



### **生成BeanDefinition**

### **ClassPathBeanDefinitionScanner.doScan方法源码** 

1.首先findCandidateComponents扫描所有的bean存储到BeanDefinitionHolder中。

2.通过MetadataReaderFactory解析注解信息类的名字，作用域等信息

3.检查是否有重复的bean如果有，就抛异常

![image-20230605211124707](C:\Users\a3245\Desktop\笔记\从源码上浅浅的过一遍Spring生命周期(上).assets\image-20230605211124707.png)

4.通过DefaultListableBeanFactory.registerBeanDefinition方法真正的把beanDefinition注册到**Spring容器 beanDefinitionMap 中**

```java
protected Set<BeanDefinitionHolder> doScan(String... basePackages) {
		Set<BeanDefinitionHolder> beanDefinitions = new LinkedHashSet<>();
		for (String basePackage : basePackages) {
			//这一步是得到 BeanDefinition
			Set<BeanDefinition> candidates = findCandidateComponents(basePackage);

			for (BeanDefinition candidate : candidates) {
				ScopeMetadata scopeMetadata = this.scopeMetadataResolver.resolveScopeMetadata(candidate);
				candidate.setScope(scopeMetadata.getScopeName());

				String beanName = this.beanNameGenerator.generateBeanName(candidate, this.registry);

				if (candidate instanceof AbstractBeanDefinition) {
					postProcessBeanDefinition((AbstractBeanDefinition) candidate, beanName);
				}
				if (candidate instanceof AnnotatedBeanDefinition) {
					// 解析@Lazy、@Primary、@DependsOn、@Role、@Description
					AnnotationConfigUtils.processCommonDefinitionAnnotations((AnnotatedBeanDefinition) candidate);
				}

				// 检查Spring容器中是否已经存在该beanName
				if (checkCandidate(beanName, candidate)) {
					BeanDefinitionHolder definitionHolder = new BeanDefinitionHolder(candidate, beanName);
					definitionHolder =
							AnnotationConfigUtils.applyScopedProxyMode(scopeMetadata, definitionHolder, this.registry);
					beanDefinitions.add(definitionHolder);

					// 注册
					registerBeanDefinition(definitionHolder, this.registry);
				}
			}
		}
		return beanDefinitions;
	}

```

### **ClassPathScanningCandidateComponentProvider.scanCandidateComponents源码**

这一步获取包下的所有class文件，解析注解信息。**ExcludeFilter**表示排除过滤器，**IncludeFilter**表示包含过滤器。会判断@Component上的信息是否符合includeFilters符合才add进BeanDefinition。

```java
private Set<BeanDefinition> scanCandidateComponents(String basePackage) {
		Set<BeanDefinition> candidates = new LinkedHashSet<>();
		try {
			// 获取basePackage下所有的文件资源
			String packageSearchPath = ResourcePatternResolver.CLASSPATH_ALL_URL_PREFIX +
					resolveBasePackage(basePackage) + '/' + this.resourcePattern;

			Resource[] resources = getResourcePatternResolver().getResources(packageSearchPath);
			for (Resource resource : resources) {
				if (resource.isReadable()) {
						//通过ASM技术获取元数据
					MetadataReader metadataReader = getMetadataReaderFactory().getMetadataReader(resource);
						// excludeFilters、includeFilters判断
					if (isCandidateComponent(metadataReader)) { // @Component-->includeFilters判断
						ScannedGenericBeanDefinition sbd = new ScannedGenericBeanDefinition(metadataReader);
						sbd.setSource(resource);
							//第二次判断，是否是接口，抽象类，内部类
						if (isCandidateComponent(sbd)) {
							if (debugEnabled) {
								logger.debug("Identified candidate component class: " + resource);
							}
								candidates.add(sbd);
								
		return candidates;
	}

```



## 2.合并BeanDefinition为RootBeanDefinition



### **AbstractBeanFactory.getMergedBeanDefinition**

**它是Spring进行bean配置处理的一个关键步骤,用于保证不论bean定义出现在何处,Spring都能够获得其完整配置并准确实例化bean。**

这个方法主要是获取一个bean的合并后配置信息。什么是合并后配置信息?

在Spring中,bean的配置信息可以出现在多个地方,比如:- 多个XML配置文件
\- Java注解
\- JavaConfig类
\- 之前定义的bean作为parent等Spring需要将这些来自不同地方的bean配置信息进行合并,得到一个唯一的、完整的配置信息对象,以供接下来的bean实例化等操作使用。getMergedBeanDefinition方法的作用就是提供这一合并功能。
\- 通过注解指定的配置
\- JavaConfig类中的配置
\- 父bean的配置(如果指定了parent属性)

```java
protected RootBeanDefinition getMergedBeanDefinition(
			String beanName, BeanDefinition bd, @Nullable BeanDefinition containingBd)
			throws BeanDefinitionStoreException {

		synchronized (this.mergedBeanDefinitions) {
			RootBeanDefinition mbd = null;
			RootBeanDefinition previous = null;

			// Check with full lock now in order to enforce the same merged instance.
			if (containingBd == null) {
				mbd = this.mergedBeanDefinitions.get(beanName);
			}

			if (mbd == null || mbd.stale) {
				previous = mbd;
				//这一步如果没有设置Parentsh属性那就拷贝一份BeanDefinition到RootBeanDefinition
				if (bd.getParentName() == null) {
					// Use copy of given root bean definition.
					if (bd instanceof RootBeanDefinition) {
						mbd = ((RootBeanDefinition) bd).cloneBeanDefinition();
					}
					else {
						mbd = new RootBeanDefinition(bd);
					}
				}
				else {
					// Child bean definition: needs to be merged with parent.
					// pbd表示parentBeanDefinition
					BeanDefinition pbd;
					try {
						String parentBeanName = transformedBeanName(bd.getParentName());
						if (!beanName.equals(parentBeanName)) {
							pbd = getMergedBeanDefinition(parentBeanName);
						}
						else {
							BeanFactory parent = getParentBeanFactory();
							if (parent instanceof ConfigurableBeanFactory) {
								pbd = ((ConfigurableBeanFactory) parent).getMergedBeanDefinition(parentBeanName);
							}
							//省略代码
						}
					}
					// Deep copy with overridden values.
					// 子BeanDefinition的属性覆盖父BeanDefinition的属性，这就是合并
					mbd = new RootBeanDefinition(pbd);
					mbd.overrideFrom(bd);
				}
                //省略代码
				if (containingBd == null && isCacheBeanMetadata()) {
					this.mergedBeanDefinitions.put(beanName, mbd);
				}
			}
			if (previous != null) {
				copyRelevantMergedBeanDefinitionCaches(previous, mbd);
			}
			return mbd;
		}
	}
```

### 

## 3.实例化非懒加载的单例Bean



**DefaultListableBeanFactory.preInstantiateSingletons()**

1.遍历beanNames集合，this.beanDefinitionNames存放了所有beanNames。

2.判断是否FactoryBean获取调用getObject时机。

3.创建Bean对象。

```java
public void preInstantiateSingletons() throws BeansException {
		List<String> beanNames = new ArrayList<>(this.beanDefinitionNames);

		// Trigger initialization of all non-lazy singleton beans...
		for (String beanName : beanNames) {
			// 获取合并后的BeanDefinition
			RootBeanDefinition bd = getMergedLocalBeanDefinition(beanName);

			if (!bd.isAbstract() && bd.isSingleton() && !bd.isLazyInit()) {
				if (isFactoryBean(beanName)) {
					// 获取FactoryBean对象
					Object bean = getBean(FACTORY_BEAN_PREFIX + beanName);
					if (bean instanceof FactoryBean) {
						FactoryBean<?> factory = (FactoryBean<?>) bean;
						boolean isEagerInit;
						if (System.getSecurityManager() != null && factory instanceof SmartFactoryBean) {
							isEagerInit = AccessController.doPrivileged(
									(PrivilegedAction<Boolean>) ((SmartFactoryBean<?>) factory)::isEagerInit,
									getAccessControlContext());
						}
						else {
							//SmartFactoryBean这个接口中有个isEagerInit方法，如果实现了这个方法并且返回true的话就直接调用getObject
							isEagerInit = (factory instanceof SmartFactoryBean &&
									((SmartFactoryBean<?>) factory).isEagerInit());
						}
						if (isEagerInit) {
							// 创建真正的Bean对象(getObject()返回的对象)
							getBean(beanName);
						}
					}
				}
				else {
					// 创建Bean对象
					getBean(beanName);
				}
			}
		}

		// 所有的非懒加载单例Bean都创建完了后
		for (String beanName : beanNames) {
			//getSingleton单例池里面拿取单例bean
			Object singletonInstance = getSingleton(beanName);
			if (singletonInstance instanceof SmartInitializingSingleton) {
				StartupStep smartInitialize = this.getApplicationStartup().start("spring.beans.smart-initialize")
						.tag("beanName", beanName);
				SmartInitializingSingleton smartSingleton = (SmartInitializingSingleton) singletonInstance;
				if (System.getSecurityManager() != null) {
					AccessController.doPrivileged((PrivilegedAction<Object>) () -> {
						smartSingleton.afterSingletonsInstantiated();
						return null;
					}, getAccessControlContext());
				}
				else {
					smartSingleton.afterSingletonsInstantiated();
				}
				smartInitialize.end();
			}
		}
	}
```

**isFactoryBean**方法作用：

-主要是判断一个bean是否是FactoryBean以判断调用getObject的时机。

```java
public boolean isFactoryBean(String name) throws NoSuchBeanDefinitionException {
		String beanName = transformedBeanName(name);
		Object beanInstance = getSingleton(beanName, false);
		if (beanInstance != null) {
			return (beanInstance instanceof FactoryBean);
		}
		// No singleton instance found -> check bean definition.
		if (!containsBeanDefinition(beanName) && getParentBeanFactory() instanceof ConfigurableBeanFactory) {
			// No bean definition found in this factory -> delegate to parent.
			return ((ConfigurableBeanFactory) getParentBeanFactory()).isFactoryBean(name);
		}
		return isFactoryBean(beanName, getMergedLocalBeanDefinition(beanName));
	}
```



### AbstractBeanFactory.getBean方法

1.这个方法里面主要就是根据不同的作用域创建不同的bean。

2.有意思的是@dependsOn（BeanName）注解r如果你的bean上面有这个注解并且声明了其他bean的名字，那么会首先创建你声明的beanName，如果出现循环依赖那就会报错，这里spring是没有解决的。

3.除去上面三种常见的bean外还有一种自定义作用域的bean比如mvc常用的request，根据自定义作用域创建的bean会通过attributes.setAttribute方法缓存起来。

```java
protected <T> T doGetBean(
			String name, @Nullable Class<T> requiredType, @Nullable Object[] args, boolean typeCheckOnly)
			throws BeansException {

		// name有可能是 &xxx 或者 xxx，如果name是&xxx，那么beanName就是xxx
		// name有可能传入进来的是别名，那么beanName就是id
		String beanName = transformedBeanName(name);
		Object beanInstance;

		// Eagerly check singleton cache for manually registered singletons.
		Object sharedInstance = getSingleton(beanName);
		if (sharedInstance != null && args == null) {
			if (logger.isTraceEnabled()) {
				if (isSingletonCurrentlyInCreation(beanName)) {
					logger.trace("Returning eagerly cached instance of singleton bean '" + beanName +
							"' that is not fully initialized yet - a consequence of a circular reference");
				}
				else {
					logger.trace("Returning cached instance of singleton bean '" + beanName + "'");
				}
			}
			//getObjectForBeanInstance这一步很有意思，可能创建出来的每一个Bean都是Factory，所以这一步就是调用getObject(),
			// 如果传入进来的是getBean(&name)那么获取到的就是BeanFactory本身。
			beanInstance = getObjectForBeanInstance(sharedInstance, name, beanName, null);
		}
			//根据getSingleton(beanName);没有拿到，那么就自己创建呗
		else {
			

			// Check if bean definition exists in this factory.
			BeanFactory parentBeanFactory = getParentBeanFactory();
			//如果没有这个Bean定义就去父beanFactory拿
			if (parentBeanFactory != null && !containsBeanDefinition(beanName)) {
				// Not found -> check parent.
				// &&&&xxx---->&xxx
				String nameToLookup = originalBeanName(name);
				if (parentBeanFactory instanceof AbstractBeanFactory) {
					return ((AbstractBeanFactory) parentBeanFactory).doGetBean(
							nameToLookup, requiredType, args, typeCheckOnly);
				}
				
			}

			if (!typeCheckOnly) {
				markBeanAsCreated(beanName);
			}

			StartupStep beanCreation = this.applicationStartup.start("spring.beans.instantiate")
					.tag("beanName", name);
			try {
				if (requiredType != null) {
					beanCreation.tag("beanType", requiredType::toString);
				}
				RootBeanDefinition mbd = getMergedLocalBeanDefinition(beanName);

				// 检查BeanDefinition是不是Abstract的
				checkMergedBeanDefinition(mbd, beanName, args);

				// Guarantee initialization of beans that the current bean depends on.
				String[] dependsOn = mbd.getDependsOn();
				if (dependsOn != null) {
					// dependsOn表示当前beanName所依赖的，当前Bean创建之前dependsOn所依赖的Bean必须已经创建好了
					for (String dep : dependsOn) {
						// beanName是不是被dep依赖了，如果是则出现了循环依赖
						if (isDependent(beanName, dep)) {
							throw new BeanCreationException(mbd.getResourceDescription(), beanName,
									"Circular depends-on relationship between '" + beanName + "' and '" + dep + "'");
						}
						// dep被beanName依赖了，存入dependentBeanMap中，dep为key，beanName为value
						registerDependentBean(dep, beanName);

						// 创建所依赖的bean
						try {
							getBean(dep);
						}
						catch (NoSuchBeanDefinitionException ex) {
							throw new BeanCreationException(mbd.getResourceDescription(), beanName,
									"'" + beanName + "' depends on missing bean '" + dep + "'", ex);
						}
					}
				}

				// 实例化创建Bean
				if (mbd.isSingleton()) {
                    //如果单例池能获取到bean那就直接创建，否则调用lambda表达式创建bean
					sharedInstance = getSingleton(beanName, () -> {
						try {
							return createBean(beanName, mbd, args);
						}
						
					});

					beanInstance = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
				}
				else if (mbd.isPrototype()) {
					// It's a prototype -> create a new instance.
					Object prototypeInstance = null;
					try {
						//记录bean开始创建
						beforePrototypeCreation(beanName);
						//多例的原型bean就是直接创建
						prototypeInstance = createBean(beanName, mbd, args);
					}
					finally {
						afterPrototypeCreation(beanName);
					}
					beanInstance = getObjectForBeanInstance(prototypeInstance, name, beanName, mbd);
				}
				else {
					String scopeName = mbd.getScope();
					
					try {  // session.getAttriute(beaName)  setAttri
						Object scopedInstance = scope.get(beanName, () -> {
							beforePrototypeCreation(beanName);
							try {
								return createBean(beanName, mbd, args);
							}
							finally {
								afterPrototypeCreation(beanName);
							}
						});
						beanInstance = getObjectForBeanInstance(scopedInstance, name, beanName, mbd);
				}
			}
			
			finally {
				beanCreation.end();
			}
		}

		// 检查通过name所获得到的beanInstance的类型是否是requiredType
		return adaptBeanInstance(name, beanInstance, requiredType);
	}
```



### createBean&加载类

在AbstractAutowireCapableBeanFactory类的createBean()方法中，一开始就会调用：

```java
Class<?> resolvedClass = resolveBeanClass(mbd, beanName);
```

mbd.hasBeanClass()确保bean是一个class如果不是，就会调用getBeanClass创建class

```java
			if (mbd.hasBeanClass()) {
				return mbd.getBeanClass();
			}

			// 如果beanClass没有被加载
			if (System.getSecurityManager() != null) {
				return AccessController.doPrivileged((PrivilegedExceptionAction<Class<?>>)
						() -> doResolveBeanClass(mbd, typesToMatch), getAccessControlContext());
			}
			else {
				return doResolveBeanClass(mbd, typesToMatch);
			}
```

会利用BeanFactory所设置的类加载器来加载类，如果没有设置，则默认使用**ClassUtils.getDefaultClassLoader()**所返回的类加载器来加载。

**ClassUtils.getDefaultClassLoader()** 

 

1优先返回当前线程中的ClassLoader

2线程中类加载器为null的情况下，返回ClassUtils类的类加载器

3如果ClassUtils类的类加载器为空，那么则表示是Bootstrap类加载器加载的ClassUtils类，那么则返回系统类加载器



### 实例化前

 **applyBeanPostProcessorsBeforeInstantiation**会让所有定义的bean都走一遍我们重写的InstantiationAwareBeanPostProcessor接口的方法，

比如A,实现了InstantiationAwareBeanPostProcessor接口，那么所有的B都会走一遍；

再比如A实现了这个接口，B也实现了，那么都会走一遍，控制顺序在order方法里，如果A返回了结果那么B就不会走了。

```java
// 实例化前 注意如果实例化前返回了bean那么就会用你返回的bean不会往下走了
Object bean = resolveBeforeInstantiation(beanName, mbdToUse);
if (bean != null) {
   return bean;
}


	@Nullable
	protected Object resolveBeforeInstantiation(String beanName, RootBeanDefinition mbd) {
		Object bean = null;
		if (!Boolean.FALSE.equals(mbd.beforeInstantiationResolved)) {
			// Make sure bean class is actually resolved at this point.
			// synthetic表示合成，如果某些Bean式合成的，那么则不会经过BeanPostProcessor的处理
			if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
				Class<?> targetType = determineTargetType(beanName, mbd);
				if (targetType != null) {
					bean = applyBeanPostProcessorsBeforeInstantiation(targetType, beanName);
					if (bean != null) {
						bean = applyBeanPostProcessorsAfterInitialization(bean, beanName);
					}
				}
			}
			mbd.beforeInstantiationResolved = (bean != null);
		}
		return bean;
	}
```

spring把实现了BeanPostProcessor的bean以及方法都缓存起来，这样就不用每次都要一个一个去实现

```java
static class BeanPostProcessorCache {

   final List<InstantiationAwareBeanPostProcessor> instantiationAware = new ArrayList<>();

   final List<SmartInstantiationAwareBeanPostProcessor> smartInstantiationAware = new ArrayList<>();

   final List<DestructionAwareBeanPostProcessor> destructionAware = new ArrayList<>();

   final List<MergedBeanDefinitionPostProcessor> mergedDefinition = new ArrayList<>();
}
```



### 实例化

**AbstractAutowireCapableBeanFactory.doCreateBean**方法中：

方法里面包含了很多，包括通过推断构造方法实例化，@Bean实例化

```java
// 创建Bean实例
			instanceWrapper = createBeanInstance(beanName, mbd, args);
```



### 实例化后

这段代码在**AbstractAutowireCapableBeanFactory.doCreateBean**方法中的populateBean：

会去调用我们之前缓存起来的InstantiationAwareBeanPostProcessor，用这个bean去做实例化后处理。

**注意：**实例化之前接受的是Class实例化之后接受的是bean，但是这个bean的属性是没有值的。因为没有做属性注入。

```java
// 实例化之后，属性设置之前
		if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
			for (InstantiationAwareBeanPostProcessor bp : getBeanPostProcessorCache().instantiationAware) {
				if (!bp.postProcessAfterInstantiation(bw.getWrappedInstance(), beanName)) {
					return;
				}
			}
		}
```



## 4.属性赋值



### spring中过时的Bean注入方式

**AbstractAutowireCapableBeanFactory.populateBean**方法中

在实例化后方法走完，会判断你的属性里面是否包含**@Bean(autowire = Autowire.BY_NAME)**如果包含就会走这种过时的注入方法，前提是必须有set方法。

```java
	//还可以BY_TYPE，根据类型注入
	@Bean(autowire = Autowire.BY_NAME)
	public UserService setUserService() {
		return new UserService();
	}

if (resolvedAutowireMode == AUTOWIRE_BY_NAME || resolvedAutowireMode == AUTOWIRE_BY_TYPE) {
   // MutablePropertyValues是PropertyValues具体的实现类
   MutablePropertyValues newPvs = new MutablePropertyValues(pvs);
   // Add property values based on autowire by name if applicable.
   if (resolvedAutowireMode == AUTOWIRE_BY_NAME) {
      autowireByName(beanName, mbd, bw, newPvs);
   }
   // Add property values based on autowire by type if applicable.
   if (resolvedAutowireMode == AUTOWIRE_BY_TYPE) {
      autowireByType(beanName, mbd, bw, newPvs);
   }
   pvs = newPvs;
}
```

### 

### 依赖注入

**AbstractAutowireCapableBeanFactory.populateBean**方法中：

这一步会去调用实现了**InstantiationAwareBeanPostProcessor.postProcessProperties**的插件对@Autowire，@Value注解等做属性赋值操作。

```java
	PropertyDescriptor[] filteredPds = null;
		if (hasInstAwareBpps) {
			if (pvs == null) {
				pvs = mbd.getPropertyValues();
			}
			for (InstantiationAwareBeanPostProcessor bp : getBeanPostProcessorCache().instantiationAware) {
				// 这里会调用AutowiredAnnotationBeanPostProcessor的postProcessProperties()方法，会直接给对象中的属性赋值
				// AutowiredAnnotationBeanPostProcessor内部并不会处理pvs，直接返回了
				PropertyValues pvsToUse = bp.postProcessProperties(pvs, bw.getWrappedInstance(), beanName);
				if (pvsToUse == null) {
					if (filteredPds == null) {
						filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
					}
					pvsToUse = bp.postProcessPropertyValues(pvs, filteredPds, bw.getWrappedInstance(), beanName);
					if (pvsToUse == null) {
						return;
					}
				}
				pvs = pvsToUse;
			}
		}
```



## 5.Bean的初始化



### 初始化前

还是**AbstractAutowireCapableBeanFactory.doCreateBean**方法，在走完一些列实例化流程后开始我们的初始化

```java
exposedObject = initializeBean(beanName, exposedObject, mbd);
```

首先**invokeAwareMethods**方法会对实现了**BeanNameAware**，**BeanFactoryAware**的方法进行回调。

再执行初始化前方法。具体的用法我也没了解过。。。

```java
protected Object initializeBean(String beanName, Object bean, @Nullable RootBeanDefinition mbd) {
   if (System.getSecurityManager() != null) {
      AccessController.doPrivileged((PrivilegedAction<Object>) () -> {
         invokeAwareMethods(beanName, bean);
         return null;
      }, getAccessControlContext());
   }
   else {
      invokeAwareMethods(beanName, bean);
   }

   Object wrappedBean = bean;

   // 初始化前
   if (mbd == null || !mbd.isSynthetic()) {
      wrappedBean = applyBeanPostProcessorsBeforeInitialization(wrappedBean, beanName);
   }

   // 初始化
   try {
      invokeInitMethods(beanName, wrappedBean, mbd);
   }
   catch (Throwable ex) {
      throw new BeanCreationException(
            (mbd != null ? mbd.getResourceDescription() : null),
            beanName, "Invocation of init method failed", ex);
   }

   // 初始化后 AOP
   if (mbd == null || !mbd.isSynthetic()) {
      wrappedBean = applyBeanPostProcessorsAfterInitialization(wrappedBean, beanName);
   }

   return wrappedBean;
}
```



### 初始化

1查看当前Bean对象是否实现了InitializingBean接口，如果实现了就调用其afterPropertiesSet()方法
2执行BeanDefinition中指定的初始化方法.

```java
jprotected void invokeInitMethods(String beanName, Object bean, @Nullable RootBeanDefinition mbd)
      throws Throwable {

   boolean isInitializingBean = (bean instanceof InitializingBean);
   if (isInitializingBean && (mbd == null || !mbd.isExternallyManagedInitMethod("afterPropertiesSet"))) {
    
      if (System.getSecurityManager() != null) {
         try {
            AccessController.doPrivileged((PrivilegedExceptionAction<Object>) () -> {
               ((InitializingBean) bean).afterPropertiesSet();
               return null;
            }, getAccessControlContext());
         }
      }
      else {
         ((InitializingBean) bean).afterPropertiesSet();
      }
   }

   if (mbd != null && bean.getClass() != NullBean.class) {
      String initMethodName = mbd.getInitMethodName();
      if (StringUtils.hasLength(initMethodName) &&
            !(isInitializingBean && "afterPropertiesSet".equals(initMethodName)) &&
            !mbd.isExternallyManagedInitMethod(initMethodName)) {
         invokeCustomInitMethod(beanName, bean, mbd);
      }
   }
}
```



### 初始化后

这是Bean创建生命周期中的最后一个步骤，可以在这个步骤中，对Bean最终进行处理，Spring中的AOP就是基于初始化后实现的，初始化后返回的对象才是最终的Bean对象。

```java
// 初始化后 AOP
if (mbd == null || !mbd.isSynthetic()) {
   wrappedBean = applyBeanPostProcessorsAfterInitialization(wrappedBean, beanName);
}
```

### 总结BeanPostProcessor

1InstantiationAwareBeanPostProcessor.postProcessBeforeInstantiation()
2实例化
3MergedBeanDefinitionPostProcessor.postProcessMergedBeanDefinition()
4InstantiationAwareBeanPostProcessor.postProcessAfterInstantiation()
5自动注入
6InstantiationAwareBeanPostProcessor.postProcessProperties()
7Aware对象
8BeanPostProcessor.postProcessBeforeInitialization()
9初始化
10BeanPostProcessor.postProcessAfterInitialization()
