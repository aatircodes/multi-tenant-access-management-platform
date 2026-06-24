package saas_access_platform.security;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CurrentUserContext {

    private Long userId;
    private Long orgId;
    private String email;
    private List<String> roles;
}