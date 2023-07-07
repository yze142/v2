---
title: 依赖注入@Autowired
# 图
# cover: /assets/images/cover1.jpg
# 图标
icon: page
---
## 大体流程
1.调用postProcessProperties后置处理器，寻找注入点。
2.遍历注入点进行类型匹配。
3.调用核心方法resolveDependency方法找bean并且根据注解类型返回注入的值。
4.反射注入。

​                  

[image-20230707164850911](https://yygh-yze142.oss-cn-shenzhen.aliyuncs.com/spring%E8%87%AA%E5%8A%A8%E6%B3%A8%E5%85%A5%E6%B5%81%E7%A8%8B.drawio.png)



## 寻找注入点
在创建一个Bean的过程中，Spring会利用AutowiredAnnotationBeanPostProcessor的**postProcessMergedBeanDefinition()**找出注入点并缓存，找注入点的流程为：
1.遍历当前类的所有的属性字段Field
2.判断字段类型是不是String，Integer等类型，查看字段上是否存在@Autowired、@Value、@Inject中的其中任意一个，存在则认为该字段是一个注入点
3.如果字段是static的，则不进行注入
4.获取@Autowired中的required属性的值
5.将字段信息构造成一个**AutowiredFieldElement对象**，作为一个**注入点对象**添加到currElements集合中。
6.遍历当前类的所有方法Method
7.判断当前Method是否是**桥接方法**，如果是找到原方法
8.查看方法上是否存在@Autowired、@Value、@Inject中的其中任意一个，存在则认为该方法是一个注入点
9.如果方法是static的，则不进行注入
10.获取@Autowired中的required属性的值
11.将方法信息构造成一个**AutowiredMethodElement对象**，作为一个**注入点对象**添加到currElements集合中。
12.遍历完当前类的字段和方法后，将**遍历父类**的，直到没有父类。
13.最后将currElements集合封装成一个InjectionMetadata对象，作为当前Bean对于的注入点集合对象，并缓存。

```java
public PropertyValues postProcessProperties(PropertyValues pvs, Object bean, String beanName) {
    // 找注入点（所有被@Autowired注解了的Field或Method）
    InjectionMetadata metadata = findAutowiringMetadata(beanName, bean.getClass(), pvs);
}
```
这里会同时找属性注入点和method注入点，属性字段和Method注入也是一样的。
遍历结束后用BeanName加InjectedElement存到this.injectionMetadataCache.put(cacheKey, metadata);缓存
**Element结构**
![image.png](https://cdn.nlark.com/yuque/0/2023/png/29415206/1687957098366-e72dc93f-7df0-4821-ac52-3f29245cdd4b.png#averageHue=%23f9f7f5&clientId=u0b788dfb-13a5-4&from=paste&height=532&id=u9a1fffbd&originHeight=532&originWidth=909&originalType=binary&ratio=1.25&rotation=0&showTitle=false&size=53579&status=done&style=none&taskId=u961b5308-43fc-4cb6-aa39-895019552e9&title=&width=909)
```java
private InjectionMetadata buildAutowiringMetadata(final Class<?> clazz) {
    // 如果一个Bean的类型是String...，那么则根本不需要进行依赖注入
    if (!AnnotationUtils.isCandidateClass(clazz, this.autowiredAnnotationTypes)) {
        return InjectionMetadata.EMPTY;
    }

    List<InjectionMetadata.InjectedElement> elements = new ArrayList<>();
    Class<?> targetClass = clazz;

    do {
        final List<InjectionMetadata.InjectedElement> currElements = new ArrayList<>();

        // 遍历targetClass中的所有Field
        ReflectionUtils.doWithLocalFields(targetClass, field -> {
            // field上是否存在@Autowired、@Value、@Inject中的其中一个
            MergedAnnotation<?> ann = findAutowiredAnnotation(field);
            if (ann != null) {
                // static filed不是注入点，不会进行自动注入
                if (Modifier.isStatic(field.getModifiers())) {
                    if (logger.isInfoEnabled()) {
                        logger.info("Autowired annotation is not supported on static fields: " + field);
                    }
                    return;
                }

                // 构造注入点
                boolean required = determineRequiredStatus(ann);
                //如果包含@Autowired注解就是一个注入点就添加到InjectionMetadata.InjectedElement中
                currElements.add(new AutowiredFieldElement(field, required));
            }
        });

        // 遍历targetClass中的所有Method
        ReflectionUtils.doWithLocalMethods(targetClass, method -> {

            Method bridgedMethod = BridgeMethodResolver.findBridgedMethod(method);
            if (!BridgeMethodResolver.isVisibilityBridgeMethodPair(method, bridgedMethod)) {
                return;
            }
            // method上是否存在@Autowired、@Value、@Inject中的其中一个
            MergedAnnotation<?> ann = findAutowiredAnnotation(bridgedMethod);
            if (ann != null && method.equals(ClassUtils.getMostSpecificMethod(method, clazz))) {
                // static method不是注入点，不会进行自动注入
                if (Modifier.isStatic(method.getModifiers())) {
                    if (logger.isInfoEnabled()) {
                        logger.info("Autowired annotation is not supported on static methods: " + method);
                    }
                    return;
                }
                // set方法最好有入参
                if (method.getParameterCount() == 0) {
                    if (logger.isInfoEnabled()) {
                        logger.info("Autowired annotation should only be used on methods with parameters: " +
                                    method);
                    }
                }
                boolean required = determineRequiredStatus(ann);
                PropertyDescriptor pd = BeanUtils.findPropertyForMethod(bridgedMethod, clazz);
                currElements.add(new AutowiredMethodElement(method, required, pd));
            }
        });

        elements.addAll(0, currElements);
        //再遍历父类
        targetClass = targetClass.getSuperclass();
    }
    while (targetClass != null && targetClass != Object.class);

    return InjectionMetadata.forElements(elements, clazz);
}
```

## 注入
### 方法注入
1.上面说了找到注入点后会把注入信息存到**InjectionMetadata**中，**InjectionMetadata**会调用**inject**方法进行属性注入操作。
```java
target:bean实例
beanName：当前bean名称
pvs：注入的属性（属性名称，属性值）
public void inject(Object target, @Nullable String beanName, @Nullable PropertyValues pvs) throws Throwable {
    //checkedElements中放的就是扫描到的所有注入点信息
    Collection<InjectedElement> checkedElements = this.checkedElements;
    Collection<InjectedElement> elementsToIterate =
    (checkedElements != null ? checkedElements : this.injectedElements);
    if (!elementsToIterate.isEmpty()) {
        // 遍历每个注入点进行依赖注入
        for (InjectedElement element : elementsToIterate) {
            element.inject(target, beanName, pvs);
        }
    }
}
```
走到inject方法的时候默认是使用Resouce的注入，如果我们要看@Autowired的注入就要查看子实现。
可以看到有两个实现方法，分别是用于属性注入和方法注入的
![image.png](https://cdn.nlark.com/yuque/0/2023/png/29415206/1687962128047-247a8fe6-f418-4600-8a89-a4df22c9d7fc.png#averageHue=%23f7f2e2&clientId=u0b788dfb-13a5-4&from=paste&height=165&id=u0188c861&originHeight=165&originWidth=1810&originalType=binary&ratio=1.25&rotation=0&showTitle=false&size=28769&status=done&style=none&taskId=u61d50ce2-17a2-4417-bdaa-1753d17a04d&title=&width=1810)

2.调用resolveMethodArguments方法获取注入bean。
```java
protected void inject(Object bean, @Nullable String beanName, @Nullable PropertyValues pvs) throws Throwable {
    // 如果pvs中已经有当前注入点的值了，则跳过注入
    if (checkPropertySkipping(pvs)) {
        return;
    }
    Method method = (Method) this.member;
    Object[] arguments;
    if (this.cached) {
        try {
            arguments = resolveCachedArguments(beanName);
        }
    }
    else {
        arguments = resolveMethodArguments(method, bean, beanName);
    }
    if (arguments != null) {
        try {
            //调用set方法进行一个个赋值
            ReflectionUtils.makeAccessible(method);
            method.invoke(bean, arguments);
        }
    }
}
```

3.该方法内部会调用核心方法**DefultListableBeanFactory.resolveDepency**会返回一个当前注入属性的值。

1）循环调用resolveDependency方法用当前注入点找他匹配的属性值 ，**方法参数详解：**
currDesc对象里封装了方法的参数值包括类型名称等等。
beanName当前bean的名称。
autowiredBeans自动注入的属性名称集合。
typeConverter当前BeanFactory的类型转换器。
```java
@Nullable
private Object[] resolveMethodArguments(Method method, Object bean, @Nullable String beanName) {
    //获取参数个数并且创建一个新的数组接收
    int argumentCount = method.getParameterCount();
    Object[] arguments = new Object[argumentCount];
    DependencyDescriptor[] descriptors = new DependencyDescriptor[argumentCount];
    Set<String> autowiredBeans = new LinkedHashSet<>(argumentCount);
    Assert.state(beanFactory != null, "No BeanFactory available");
    TypeConverter typeConverter = beanFactory.getTypeConverter();

    // 遍历每个方法参数，找到匹配的bean对象
    for (int i = 0; i < arguments.length; i++) {
        MethodParameter methodParam = new MethodParameter(method, i);

        DependencyDescriptor currDesc = new DependencyDescriptor(methodParam, this.required);
        currDesc.setContainingClass(bean.getClass());
        descriptors[i] = currDesc;
        try {
            Object arg = beanFactory.resolveDependency(currDesc, beanName, autowiredBeans, typeConverter);
            if (arg == null && !this.required) {
                arguments = null;
                break;
            }
            arguments[i] = arg;
        }
        catch (BeansException ex) {
            throw new UnsatisfiedDependencyException(null, beanName, new InjectionPoint(methodParam), ex);
        }
    }
}
```

#### 根据注入点匹配Bean类型
**resolveDependency方法：**

```java
public Object resolveDependency(DependencyDescriptor descriptor, @Nullable String requestingBeanName,
                                @Nullable Set<String> autowiredBeanNames, @Nullable TypeConverter typeConverter) throws BeansException {
    // 用来获取方法入参名字的
    descriptor.initParameterNameDiscovery(getParameterNameDiscoverer());

    // 所需要的类型是Optional
    if (Optional.class == descriptor.getDependencyType()) {
        return createOptionalDependency(descriptor, requestingBeanName);
    }
        // 所需要的的类型是ObjectFactory，或ObjectProvider
        //DependencyObjectProvider是Spring框架提供的用于延迟解析依赖的类。
    else if (ObjectFactory.class == descriptor.getDependencyType() ||
             ObjectProvider.class == descriptor.getDependencyType()) {
        return new DependencyObjectProvider(descriptor, requestingBeanName);
    }
    else if (javaxInjectProviderClass == descriptor.getDependencyType()) {
        return new Jsr330Factory().createDependencyProvider(descriptor, requestingBeanName);
    }
    else {
        // 在属性或set方法上使用了@Lazy注解，那么则构造一个代理对象并返回，真正使用该代理对象时才进行类型筛选Bean
        Object result = getAutowireCandidateResolver().getLazyResolutionProxyIfNecessary(
            descriptor, requestingBeanName);

        if (result == null) {
            // descriptor表示某个属性或某个set方法
            // requestingBeanName表示正在进行依赖注入的Bean
            result = doResolveDependency(descriptor, requestingBeanName, autowiredBeanNames, typeConverter);
        }
        return result;
    }
}
```

**忽略前面特殊情况的不管，我们直接进入doResolveDependency方法：**
1.先去缓存中找如果找到了就直接返回。
2.如果当前是@Value注解，就解析里面的$占位符和spring表达式，spring是会根据占位符去配置文件或者JVM运行时环境变量里面找对应的属性。
3.如果注入的属性是List或者map类型，spring就会根据你指定的泛型去寻找bean并且全部注入。注意必须指定一个类型，哪怕是object都行，比如如果泛型是Object，就会注入所有的bean。
4.如果是正常Bean就走正常逻辑，如果找到的bean有多个就会根据名字判断bean，如果名字一样就会报错。但是如果我们加了@Primary注解的话就会优先注入加了@Primary注解的bean从而不考虑类型。
5.有可能筛选出来的是某个bean的类型，此处就进行实例化，调用getBean。注意这里就跟循环依赖有关了，后面会讲。
```java
/**
 *
 * @param descriptor 依赖的描述符 包含依赖对象的类型、名称、是否必须等信息,用于指导依赖对象的解析。
 * @param beanName 解析这个bean里面需要自动注入的属性
 * @param autowiredBeanNames  自动装配的bean名称集合,如果依赖是通过自动装配(byType)解析的,
    这里会包含所有匹配类型的bean名称,解析完成后会添加进去记录
 * @param typeConverter
 * @return
 * @throws BeansException
 * 方法的大概作用就是根据descriptor的属性去BeanDefinition中解析到匹配的bean然后返还
 */
@Nullable
public Object doResolveDependency(DependencyDescriptor descriptor, @Nullable String beanName,
                                  @Nullable Set<String> autowiredBeanNames, @Nullable TypeConverter typeConverter) throws BeansException {

    InjectionPoint previousInjectionPoint = ConstructorResolver.setCurrentInjectionPoint(descriptor);
    try {
        // 如果当前descriptor之前做过依赖注入了，则可以直接取shortcut了，相当于缓存
        Object shortcut = descriptor.resolveShortcut(this);
        if (shortcut != null) {
            return shortcut;
        }

        Class<?> type = descriptor.getDependencyType();
        // 获取@Value所指定的值
        Object value = getAutowireCandidateResolver().getSuggestedValue(descriptor);
        if (value != null) {
            if (value instanceof String) {
                // 占位符填充(${})
                String strVal = resolveEmbeddedValue((String) value);
                BeanDefinition bd = (beanName != null && containsBean(beanName) ?
                                     getMergedBeanDefinition(beanName) : null);
                // 解析Spring表达式(#{})
                value = evaluateBeanDefinitionString(strVal, bd);
            }
            // 将value转化为descriptor所对应的类型
            TypeConverter converter = (typeConverter != null ? typeConverter : getTypeConverter());
            try {
                return converter.convertIfNecessary(value, type, descriptor.getTypeDescriptor());
            }
        }

        // 如果descriptor所对应的类型是数组、Map这些，就将descriptor对应的类型所匹配的所有bean方法，不用进一步做筛选了
        Object multipleBeans = resolveMultipleBeans(descriptor, beanName, autowiredBeanNames, typeConverter);
        if (multipleBeans != null) {
            return multipleBeans;
        }

        // 找到所有Bean，key是beanName, value有可能是bean对象，有可能是beanClass
        Map<String, Object> matchingBeans = findAutowireCandidates(beanName, type, descriptor);
        if (matchingBeans.isEmpty()) {
            // required为true，抛异常
            if (isRequired(descriptor)) {
                raiseNoMatchingBeanFound(type, descriptor.getResolvableType(), descriptor);
            }
            return null;
        }

        String autowiredBeanName;
        Object instanceCandidate;

if (matchingBeans.size() > 1) {
            // 根据类型找到了多个Bean，进一步筛选出某一个, @Primary-->优先级最高--->name
            autowiredBeanName = determineAutowireCandidate(matchingBeans, descriptor);
            //如果没找到并且@Required属性为ture(必须要一个值)就会抛异常
 if (autowiredBeanName == null) {
    if (isRequired(descriptor) || !indicatesMultipleBeans(type)) {
      return descriptor.resolveNotUnique(descriptor.getResolvableType(), matchingBeans);
      }
      else {
      // In case of an optional Collection/Map, silently ignore a non-unique case:
      // possibly it was meant to be an empty collection of multiple regular beans
      // (before 4.3 in particular when we didn't even look for collection beans).
      return null;
      }
      }
      instanceCandidate = matchingBeans.get(autowiredBeanName);
      }
      else {
      // We have exactly one match.
      Map.Entry<String, Object> entry = matchingBeans.entrySet().iterator().next();
      autowiredBeanName = entry.getKey();
      instanceCandidate = entry.getValue();
      }

      // 记录匹配过的beanName
      if (autowiredBeanNames != null) {
      autowiredBeanNames.add(autowiredBeanName);
      }
      // 有可能筛选出来的是某个bean的类型，此处就进行实例化，调用getBean
      if (instanceCandidate instanceof Class) {
      instanceCandidate = descriptor.resolveCandidate(autowiredBeanName, type, this);
      }
      Object result = instanceCandidate;
      if (result instanceof NullBean) {
      if (isRequired(descriptor)) {
      raiseNoMatchingBeanFound(type, descriptor.getResolvableType(), descriptor);
      }
      result = null;
      }
      if (!ClassUtils.isAssignableValue(type, result)) {
      throw new BeanNotOfRequiredTypeException(autowiredBeanName, type, instanceCandidate.getClass());
      }
      return result;
      }
      finally {
      ConstructorResolver.setCurrentInjectionPoint(previousInjectionPoint);
      }
      }
```

#### findAutowireCandidates方法
findAutowireCandidates是专门做类型匹配的方法，也是很核心的一个方法。
1.根据类型去匹配到所有BeanName：BeanFactoryUtils.beanNamesForTypeIncludingAncestors方法内部做的很复杂，我只截图一小块参考：核心方法就是isTypeMatch方法，会去容器内找到所有的BeanName然后去三层缓存中拿Class类型，然后匹配你要注入的Bean类型（typeMatch）。
![](https://cdn.nlark.com/yuque/0/2023/png/29415206/1688219292549-93a29311-0ec0-44c5-b56b-8d1a4f62852f.png?x-oss-process=image%2Fresize%2Cw_750%2Climit_0#averageHue=%23fcfbfa&from=url&id=jGy4B&originHeight=525&originWidth=750&originalType=binary&ratio=1&rotation=0&showTitle=false&status=done&style=none&title=)
2.把resolvableDependencies中key为type的对象找出来并添加到result中 resolvableDependencies中存放的是类型：Bean对象，比如BeanFactory.class:BeanFactory对象，在Spring启动时设置。
3.遍历根据type找出的beanName，判断当前beanName对应的Bean是不是能够被自动注入，这里会做一个判断，如果找到的类型有多个且包括自己，他会优先注入其他的，如果只有一个且是自己，那就只能注入自己。比如自己注入自己！
4.先判断beanName对应的BeanDefinition中的autowireCandidate属性，如果为false，表示不能用来进行自动注入，如果为true则继续进行判断
5.判断当前type是不是泛型，如果是泛型是会把容器中所有的beanName找出来的，如果是这种情况，那么在这一步中就要获取到泛型的真正类型，然后进行匹配，如果当前beanName和当前泛型对应的真实类型匹配，那么则继续判断
6.如果当前DependencyDescriptor上存在@Qualifier注解，那么则要判断当前beanName上是否定义了Qualifier，并且是否和当前DependencyDescriptor上的Qualifier相等，相等则匹配
7.经过上述验证之后，当前beanName才能成为一个可注入的，添加到result中

```java
protected Map<String, Object> findAutowireCandidates(
    @Nullable String beanName, Class<?> requiredType, DependencyDescriptor descriptor) {

    // 从BeanFactory中找出和requiredType所匹配的beanName，仅仅是beanName，这些bean不一定经过了实例化，只有到最终确定某个Bean了，如果这个Bean还没有实例化才会真正进行实例化
    String[] candidateNames = BeanFactoryUtils.beanNamesForTypeIncludingAncestors(
        this, requiredType, true, descriptor.isEager());
    Map<String, Object> result = CollectionUtils.newLinkedHashMap(candidateNames.length);

    // 根据类型从resolvableDependencies中匹配Bean，resolvableDependencies中存放的是类型：Bean对象，比如BeanFactory.class:BeanFactory对象，在Spring启动时设置
    for (Map.Entry<Class<?>, Object> classObjectEntry : this.resolvableDependencies.entrySet()) {
        Class<?> autowiringType = classObjectEntry.getKey();
        if (autowiringType.isAssignableFrom(requiredType)) {
            Object autowiringValue = classObjectEntry.getValue();
            autowiringValue = AutowireUtils.resolveAutowiringValue(autowiringValue, requiredType);

            if (requiredType.isInstance(autowiringValue)) {
                result.put(ObjectUtils.identityToString(autowiringValue), autowiringValue);
                break;
            }
        }
    }

    for (String candidate : candidateNames) {
        // 如果不是自己，则判断该candidate到底能不能用来进行自动注入
        if (!isSelfReference(beanName, candidate) && isAutowireCandidate(candidate, descriptor)) {
            addCandidateEntry(result, candidate, descriptor, requiredType);
        }
    }

    // 为空要么是真的没有匹配的，要么是匹配的自己
    if (result.isEmpty()) {
        // 需要匹配的类型是不是Map、数组之类的
        boolean multiple = indicatesMultipleBeans(requiredType);
        // Consider fallback matches if the first pass failed to find anything...
        DependencyDescriptor fallbackDescriptor = descriptor.forFallbackMatch();
        for (String candidate : candidateNames) {
            if (!isSelfReference(beanName, candidate) && isAutowireCandidate(candidate, fallbackDescriptor) &&
                (!multiple || getAutowireCandidateResolver().hasQualifier(descriptor))) {
                addCandidateEntry(result, candidate, descriptor, requiredType);
            }
        }

        // 匹配的是自己，被自己添加到result中
        if (result.isEmpty() && !multiple) {
            // Consider self references as a final pass...
            // but in the case of a dependency collection, not the very same bean itself.
            for (String candidate : candidateNames) {
                if (isSelfReference(beanName, candidate) &&
                    (!(descriptor instanceof MultiElementDescriptor) || !beanName.equals(candidate)) &&
                    isAutowireCandidate(candidate, fallbackDescriptor)) {
                    addCandidateEntry(result, candidate, descriptor, requiredType);
                }
            }
        }
    }
    return result;
}
```
